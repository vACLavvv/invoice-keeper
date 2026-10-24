package app

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"invoice-keeper/internal/app/config"
	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/security"
	"invoice-keeper/internal/app/store"
)

// Bootstrap creates only project-local configuration and optional non-destructive demo data.
func Bootstrap(root string, demo bool) error {
	envPath := filepath.Join(root, ".env")
	file, err := os.OpenFile(envPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600) // #nosec G304 -- the .env path is chosen by the operator
	switch {
	case err == nil:
		_, err = fmt.Fprintf(file, "ADMIN_USERNAME=admin\nADMIN_PASSWORD=%s\n"+
			"APP_TIMEZONE=Europe/Moscow\nDATABASE_PATH=./data/invoice-keeper.sqlite3\n"+
			"SESSION_HOURS=12\nCOOKIE_SECURE=false\nTELEGRAM_ENABLED=false\n"+
			"TELEGRAM_BOT_TOKEN=\nTELEGRAM_CHAT_ID=\nREMINDER_INTERVAL_SECONDS=60\n"+
			"DEMO_USERNAME=teammate\nDEMO_PASSWORD=%s\n"+
			"# Ключ шифрования данных в базе. Храните копию отдельно от базы: без него зашифрованное не прочитать.\n"+
			"DATA_ENCRYPTION_KEY=%s\n", security.RandomToken(20), security.RandomToken(16), security.NewEncryptionKey())
		if closeErr := file.Close(); err == nil {
			err = closeErr
		}
		if err != nil {
			return err
		}
		fmt.Println("Создан .env с уникальными паролями. Файл доступен только владельцу.")
	case errors.Is(err, os.ErrExist):
		fmt.Println("Существующий .env сохранён без изменений.")
	default:
		return err
	}
	settings, err := config.FromEnv(root)
	if err != nil {
		return err
	}
	db, err := store.OpenDB(settings.DatabasePath)
	if err != nil {
		return err
	}
	defer db.Close()
	if err := ConfigureEncryption(db, settings.EncryptionKey); err != nil {
		return err
	}
	if demo {
		if err := seedDemo(db, settings); err != nil {
			return err
		}
	}
	fmt.Println("Учётные данные: ADMIN_USERNAME / ADMIN_PASSWORD в .env.")
	if demo {
		fmt.Println("Обычный пользователь: DEMO_USERNAME / DEMO_PASSWORD в .env.")
	}
	fmt.Println("Запуск: go run ./cmd/invoice-keeper   →   http://127.0.0.1:18080")
	return nil
}

func seedDemo(db *store.DB, settings *config.Settings) error {
	demoUser, demoPassword := config.Env("DEMO_USERNAME", "teammate"), os.Getenv("DEMO_PASSWORD")
	switch {
	case demoPassword == "":
		return errors.New("Для демопользователя добавьте DEMO_PASSWORD (12+ символов) в .env. База не изменена.")
	case len([]rune(demoPassword)) < 12:
		return errors.New("DEMO_PASSWORD должен содержать минимум 12 символов.")
	case strings.EqualFold(demoUser, settings.AdminUsername):
		return errors.New("Логины администратора и демопользователя должны различаться.")
	}
	today := schedule.Today(settings.Location())
	samples := []struct {
		title    string
		cents    int64
		currency string
		due      int // days from today
		paid     bool
	}{
		{"Аренда офиса", 4500000, "RUB", 3, false},
		{"Облачный сервер", 2400, "USD", 1, false},
		{"Notion · командный план", 1800, "EUR", 7, false},
		{"Домен и почта", 149000, "RUB", -4, false},
		{"Figma · рабочее пространство", 1500, "USD", -2, true},
		{"Интернет в офисе", 250000, "RUB", 1 - today.Day(), true},
	}
	seeded := false
	err := db.Write(func(tx *sql.Tx) error {
		var payments, users int
		if err := tx.QueryRow("SELECT (SELECT COUNT(*) FROM recurring_payments),(SELECT COUNT(*) FROM users)").Scan(&payments, &users); err != nil {
			return err
		}
		if payments > 0 || users > 0 {
			return nil
		}
		if _, err := tx.Exec("INSERT INTO users(username,display_name,password_hash,created_at) VALUES(?,?,?,?)",
			demoUser, "Алексей · команда", security.HashPassword(demoPassword), schedule.Timestamp()); err != nil {
			return err
		}
		type paidPeriod struct {
			id  int64
			due string
		}
		var paid []paidPeriod
		for _, sample := range samples {
			due := today.AddDate(0, 0, sample.due)
			result, err := tx.Exec("INSERT INTO recurring_payments(title,amount_cents,currency,first_due_date,anchor_day,created_at) VALUES(?,?,?,?,?,?)",
				sample.title, sample.cents, sample.currency, schedule.FormatDate(due), due.Day(), schedule.Timestamp())
			if err != nil {
				return err
			}
			if sample.paid {
				id, _ := result.LastInsertId()
				paid = append(paid, paidPeriod{id, schedule.FormatDate(due)})
			}
		}
		if err := schedule.Materialize(tx, today); err != nil {
			return err
		}
		for _, p := range paid {
			if _, err := tx.Exec("UPDATE payment_occurrences SET paid_at=?,updated_by='demo',updated_at=? WHERE recurring_payment_id=? AND due_date=?",
				p.due, schedule.Timestamp(), p.id, p.due); err != nil {
				return err
			}
		}
		seeded = true
		return nil
	})
	if err != nil {
		return err
	}
	if seeded {
		fmt.Println("Добавлены платежи в RUB, USD, EUR и обычный пользователь. Отправка в Telegram отключена по умолчанию.")
	} else {
		fmt.Println("В базе уже есть данные: демоданные не добавлены, существующие записи сохранены.")
	}
	return nil
}

// Backup writes a consistent copy via VACUUM INTO; it never overwrites an existing file.
func Backup(settings *config.Settings, destination string) (string, error) {
	source, err := filepath.Abs(settings.DatabasePath)
	if err != nil {
		return "", err
	}
	if info, err := os.Stat(source); err != nil || info.IsDir() {
		return "", errors.New("Исходная база не найдена. Ничего не изменено.")
	}
	if destination, err = filepath.Abs(destination); err != nil {
		return "", err
	}
	if destination == source {
		return "", errors.New("Копия не может совпадать с исходной базой.")
	}
	if _, err := os.Stat(destination); err == nil {
		return "", errors.New("Файл назначения уже существует. Перезапись запрещена.")
	}
	if err := os.MkdirAll(filepath.Dir(destination), 0o700); err != nil {
		return "", err
	}
	db, err := store.OpenDB(source)
	if err != nil {
		return "", err
	}
	defer db.Close()
	if _, err := db.Exec("VACUUM INTO ?", destination); err != nil {
		return "", err
	}
	copyDB, err := sql.Open("sqlite", "file:"+filepath.ToSlash(destination)+"?mode=ro")
	if err != nil {
		return "", err
	}
	defer copyDB.Close()
	var check string
	if err := copyDB.QueryRow("PRAGMA integrity_check").Scan(&check); err != nil || check != "ok" {
		return "", errors.New("Копия не прошла integrity_check")
	}
	os.Chmod(destination, 0o600)
	return destination, nil
}
