// Command invoice-keeper runs the panel, the API and the reminder loop in one process.
//
//	invoice-keeper [serve] [--host 127.0.0.1] [--port 18080]
//	invoice-keeper bootstrap [--demo]
//	invoice-keeper backup [--destination path]
//	invoice-keeper healthcheck [--port 8000]
//	invoice-keeper 2fa-off
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
	"syscall"
	"time"
	_ "time/tzdata" // timezones work on Windows and in minimal containers

	invoicekeeper "invoice-keeper"
	"invoice-keeper/internal/app"
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
	default:
		err = fmt.Errorf("неизвестная команда %q; доступны serve, bootstrap, backup, healthcheck, 2fa-off", command)
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

	settings, err := app.SettingsFromEnv(root())
	if err != nil {
		return err
	}
	db, err := app.OpenDB(settings.DatabasePath)
	if err != nil {
		return err
	}
	defer db.Close()
	server, err := app.NewServer(settings, db, invoicekeeper.Assets, app.Options{})
	if err != nil {
		return err
	}
	server.Worker.Start()
	defer server.Worker.Stop()
	bot := app.NewBot(server, "")
	bot.Start()
	defer bot.Stop()

	httpServer := &http.Server{
		Addr:              net.JoinHostPort(*host, strconv.Itoa(*port)),
		Handler:           server,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	errs := make(chan error, 1)
	go func() { errs <- httpServer.ListenAndServe() }()
	log.Printf("Invoice Keeper: http://%s", httpServer.Addr)
	select {
	case err := <-errs:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		log.Print("Остановка…")
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return httpServer.Shutdown(shutdown)
}

func backup(args []string) error {
	flags := flag.NewFlagSet("backup", flag.ExitOnError)
	stamp := time.Now().UTC().Format("20060102T150405.000000Z")
	destination := flags.String("destination", filepath.Join(root(), "backups", "invoice-keeper-"+stamp+".sqlite3"), "Путь копии")
	flags.Parse(args)
	settings, err := app.SettingsFromEnv(root())
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

// twoFactorOff is the recovery path when the admin lost the authenticator.
func twoFactorOff() error {
	settings, err := app.SettingsFromEnv(root())
	if err != nil {
		return err
	}
	db, err := app.OpenDB(settings.DatabasePath)
	if err != nil {
		return err
	}
	defer db.Close()
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
