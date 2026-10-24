// Command invoice-keeper runs the panel, the API and the reminder loop in one process.
//
//	invoice-keeper [serve] [--host 127.0.0.1] [--port 18080]
//	invoice-keeper bootstrap [--demo]
//	invoice-keeper backup [--destination path]
//	invoice-keeper healthcheck [--port 8000]
//	invoice-keeper 2fa-off
//	invoice-keeper ofac-update [--file sdn.xml]
//	invoice-keeper keygen
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"sync"
	"syscall"
	"time"
	_ "time/tzdata" // timezones work on Windows and in minimal containers

	invoicekeeper "invoice-keeper"
	"invoice-keeper/internal/app"
	"invoice-keeper/internal/app/bot"
	"invoice-keeper/internal/app/config"
	"invoice-keeper/internal/app/security"
	"invoice-keeper/internal/app/store"
	"invoice-keeper/internal/app/wallet"
)

func main() {
	command, args := "serve", os.Args[1:]
	if len(args) > 0 && args[0] != "" && args[0][0] != '-' {
		command, args = args[0], args[1:]
	}
	var err error
	switch command {
	case "serve":
		err = serve(args)
	case "bootstrap":
		flags := flag.NewFlagSet("bootstrap", flag.ExitOnError)
		demo := flags.Bool("demo", false, "Добавить демоданные только в пустую базу")
		flags.Parse(args)
		err = app.Bootstrap(root(), *demo)
	case "backup":
		err = backup(args)
	case "healthcheck":
		err = healthcheck(args)
	case "2fa-off":
		err = twoFactorOff()
	case "ofac-update":
		err = ofacUpdate(args)
	case "keygen":
		fmt.Println("DATA_ENCRYPTION_KEY=" + security.NewEncryptionKey())
	default:
		err = fmt.Errorf("неизвестная команда %q; доступны serve, bootstrap, backup, healthcheck, 2fa-off, ofac-update, keygen", command)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// root is the working directory: .env and relative DATABASE_PATH are resolved against it.
func root() string {
	dir, err := os.Getwd()
	if err != nil {
		return "."
	}
	return dir
}

func serve(args []string) error {
	flags := flag.NewFlagSet("serve", flag.ExitOnError)
	host := flags.String("host", "127.0.0.1", "Адрес; по умолчанию доступен только на этом компьютере")
	port := flags.Int("port", 18080, "Порт")
	flags.Parse(args)

	settings, err := config.FromEnv(root())
	if err != nil {
		return err
	}
	if warning := config.EnvFileWarning(root()); warning != "" {
		log.Print(warning)
	}
	db, err := store.OpenDB(settings.DatabasePath)
	if err != nil {
		return err
	}
	server, err := app.NewServer(settings, db, invoicekeeper.Assets, app.Options{})
	if err != nil {
		db.Close()
		return err
	}
	httpServer := &http.Server{
		Addr:              net.JoinHostPort(*host, strconv.Itoa(*port)),
		Handler:           server,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	// Background work runs until ctx is cancelled: on SIGINT/SIGTERM or when the HTTP server fails.
	signals, stopSignals := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stopSignals()
	ctx, cancel := context.WithCancel(signals)
	defer cancel()
	var background sync.WaitGroup
	for _, run := range []func(context.Context){
		server.Worker.Run,
		bot.NewTelegram(settings, db, server.BotBackend(), "").Run,
		bot.NewMax(settings, db, server.BotBackend(), nil).Run,
		server.Sanctions.Run,
	} {
		background.Add(1)
		go func() {
			defer background.Done()
			run(ctx)
		}()
	}

	errs := make(chan error, 1)
	go func() { errs <- httpServer.ListenAndServe() }()
	log.Printf("Invoice Keeper: http://%s", httpServer.Addr)
	var failure error
	select {
	case err := <-errs:
		failure = err // e.g. the port is taken
	case <-ctx.Done():
	}
	return shutdown(httpServer, db, server, &background, cancel, stopSignals, failure)
}

const (
	drainTimeout      = 10 * time.Second // in-flight HTTP requests
	backgroundTimeout = 15 * time.Second // reminder pass, bots, OFAC download, security alerts
)

// shutdown stops in order: no new connections, in-flight requests finish, background work stops
// between messages, and only then the database is closed. A second Ctrl+C ends the process at once.
func shutdown(httpServer *http.Server, db *store.DB, server *app.Server, background *sync.WaitGroup,
	cancel context.CancelFunc, stopSignals context.CancelFunc, failure error) error {
	stopSignals() // restore the default handler: the next Ctrl+C terminates immediately
	log.Print("Остановка: новые запросы не принимаются, текущие завершаются…")

	drain, cancelDrain := context.WithTimeout(context.Background(), drainTimeout)
	defer cancelDrain()
	if err := httpServer.Shutdown(drain); err != nil {
		log.Printf("Не все запросы завершились за %s — соединения закрыты", drainTimeout)
		httpServer.Close()
	}

	cancel() // background loops stop; requests are done, so nothing starts new reminder passes
	done := make(chan struct{})
	go func() {
		background.Wait()
		server.Worker.Wait()
		server.WaitAlerts()
		close(done)
	}()
	select {
	case <-done:
		if err := db.Close(); err != nil {
			return err
		}
		log.Print("Остановлено")
	case <-time.After(backgroundTimeout):
		// The database stays open under the unfinished work; SQLite keeps it consistent on exit.
		// A reminder caught mid-send is marked «Нужна проверка» on the next start — never re-sent.
		return fmt.Errorf("фоновые задачи не завершились за %s, выход без ожидания", backgroundTimeout)
	}
	if failure != nil && !errors.Is(failure, http.ErrServerClosed) {
		return failure
	}
	return nil
}

func backup(args []string) error {
	flags := flag.NewFlagSet("backup", flag.ExitOnError)
	stamp := time.Now().UTC().Format("20060102T150405.000000Z")
	destination := flags.String("destination", filepath.Join(root(), "backups", "invoice-keeper-"+stamp+".sqlite3"), "Путь копии")
	flags.Parse(args)
	settings, err := config.FromEnv(root())
	if err != nil {
		return err
	}
	path, err := app.Backup(settings, *destination)
	if err != nil {
		return err
	}
	fmt.Println("Создана копия:", path)
	return nil
}

// ofacUpdate loads the OFAC SDN list now: from OFAC_LIST_URL, or from a downloaded file
// for servers without internet access.
func ofacUpdate(args []string) error {
	flags := flag.NewFlagSet("ofac-update", flag.ExitOnError)
	file := flags.String("file", "", "Путь к скачанному SDN.XML; по умолчанию — загрузка с OFAC_LIST_URL")
	flags.Parse(args)
	settings, err := config.FromEnv(root())
	if err != nil {
		return err
	}
	db, err := store.OpenDB(settings.DatabasePath)
	if err != nil {
		return err
	}
	defer db.Close()
	if err := app.ConfigureEncryption(db, settings.EncryptionKey); err != nil {
		return err
	}
	source := settings.OFACListURL
	if *file != "" {
		source = *file
	}
	count, err := wallet.Import(context.Background(), db, source, nil)
	if err != nil {
		return err
	}
	fmt.Printf("Список OFAC загружен: %d криптоадресов.\n", count)
	return nil
}

// twoFactorOff is the recovery path when the admin lost the authenticator.
func twoFactorOff() error {
	settings, err := config.FromEnv(root())
	if err != nil {
		return err
	}
	db, err := store.OpenDB(settings.DatabasePath)
	if err != nil {
		return err
	}
	defer db.Close()
	if err := app.ConfigureEncryption(db, settings.EncryptionKey); err != nil {
		return err
	}
	if err := app.DisableTwoFactor(db); err != nil {
		return err
	}
	fmt.Println("Двухфакторный вход администратора выключен.")
	return nil
}

func healthcheck(args []string) error {
	flags := flag.NewFlagSet("healthcheck", flag.ExitOnError)
	port := flags.Int("port", 18080, "Порт приложения")
	flags.Parse(args)
	client := http.Client{Timeout: 3 * time.Second}
	response, err := client.Get("http://127.0.0.1:" + strconv.Itoa(*port) + "/healthz")
	if err != nil {
		return err
	}
	response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("healthz: HTTP %d", response.StatusCode)
	}
	return nil
}
