package app

// Linking a Telegram account to a panel user: the panel issues a one-time link
// t.me/<bot>?start=<code> (10 minutes, stored as SHA-256); the bot receives /start <code>
// in a private chat and remembers the chat. Linked users get personal reminders for payments
// assigned to them, and their «Оплачено» is recorded under their panel name.

import (
	"database/sql"
	"errors"
	"net/http"
	"time"

	"invoice-keeper/internal/app/audit"
	"invoice-keeper/internal/app/bot"
	"invoice-keeper/internal/app/schedule"
	"invoice-keeper/internal/app/security"
)

type telegramLink struct {
	Linked      bool    `json:"linked"`
	Username    *string `json:"username"`
	LinkedAt    *string `json:"linked_at"`
	BotUsername string  `json:"bot_username"`
	Available   bool    `json:"available"`
}

func ownerArgs(user *User) (any, bool) {
	if user.Role == "admin" {
		return nil, true
	}
	return user.ID, false
}

func (s *Server) myTelegram(w http.ResponseWriter, r *http.Request) error {
	user, err := panelOnly(s.currentUser(r))
	if err != nil {
		return err
	}
	link := telegramLink{BotUsername: s.BotUsername(), Available: s.Settings.TelegramBotToken != ""}
	where, args := ownerClause(user)
	var username sql.NullString
	var linkedAt string
	err = s.DB.QueryRow("SELECT username,linked_at FROM telegram_links WHERE "+where, args...).Scan(&username, &linkedAt)
	switch {
	case err == nil:
		link.Linked, link.LinkedAt = true, &linkedAt
		if username.Valid {
			link.Username = &username.String
		}
	case !errors.Is(err, sql.ErrNoRows):
		return err
	}
	return writeJSON(w, 200, link)
}

func (s *Server) myTelegramLinkCode(w http.ResponseWriter, r *http.Request) error {
	user, err := panelOnly(s.writeUser(r))
	if err != nil {
		return err
	}
	bot := s.BotUsername()
	if s.Settings.TelegramBotToken == "" || bot == "" {
		return fail(409, "Telegram-бот не настроен на сервере")
	}
	code := security.RandomToken(16)
	expires := time.Now().Add(10 * time.Minute)
	userID, isAdmin := ownerArgs(user)
	err = s.DB.Write(func(tx *sql.Tx) error {
		if _, err := tx.Exec("DELETE FROM telegram_link_codes WHERE expires_at<=?", time.Now().Unix()); err != nil {
			return err
		}
		_, err := tx.Exec("INSERT INTO telegram_link_codes(code_hash,user_id,is_admin,expires_at) VALUES(?,?,?,?)", security.Digest(code), userID, isAdmin, expires.Unix())
		return err
	})
	if err != nil {
		return err
	}
	return writeJSON(w, 201, map[string]string{
		"url": "https://t.me/" + bot + "?start=" + code, "expires_at": expires.UTC().Format(time.RFC3339),
	})
}

func (s *Server) myTelegramUnlink(w http.ResponseWriter, r *http.Request) error {
	user, err := panelOnly(s.writeUser(r))
	if err != nil {
		return err
	}
	where, args := ownerClause(user)
	err = s.DB.Write(func(tx *sql.Tx) error {
		result, err := tx.Exec("DELETE FROM telegram_links WHERE "+where, args...) // #nosec G202 -- owner is a constant clause, values are parameters
		if err != nil {
			return err
		}
		if n, _ := result.RowsAffected(); n == 0 {
			return fail(404, "Telegram не привязан")
		}
		return audit.Record(tx, user.Username, "telegram.unlink", user.Username)
	})
	if err != nil {
		return err
	}
	return noContent(w)
}

// linkTelegram consumes a /start code; it returns the panel name the chat now belongs to.
func (s *Server) linkTelegram(code string, from bot.User, chatID int64) (string, error) {
	var name string
	err := s.DB.Write(func(tx *sql.Tx) error {
		var userID sql.NullInt64
		var isAdmin bool
		err := tx.QueryRow("SELECT user_id,is_admin FROM telegram_link_codes WHERE code_hash=? AND expires_at>?", security.Digest(code), time.Now().Unix()).
			Scan(&userID, &isAdmin)
		if errors.Is(err, sql.ErrNoRows) {
			return fail(404, "Ссылка устарела или уже использована. Получите новую в панели")
		}
		if err != nil {
			return err
		}
		if _, err := tx.Exec("DELETE FROM telegram_link_codes WHERE code_hash=?", security.Digest(code)); err != nil {
			return err
		}
		owner := "is_admin=1"
		var ownerArg []any
		if isAdmin {
			name = s.Settings.AdminUsername
		} else {
			owner, ownerArg = "user_id=?", []any{userID.Int64}
			if err := tx.QueryRow("SELECT username FROM users WHERE id=?", userID.Int64).Scan(&name); err != nil {
				return fail(404, "Пользователь удалён")
			}
		}
		// One Telegram account per panel user and vice versa.
		if _, err := tx.Exec("DELETE FROM telegram_links WHERE telegram_user_id=? OR "+owner, append([]any{from.ID}, ownerArg...)...); err != nil {
			return err
		}
		var dbUser any
		if !isAdmin {
			dbUser = userID.Int64
		}
		if _, err := tx.Exec("INSERT INTO telegram_links(user_id,is_admin,telegram_user_id,chat_id,username,linked_at) VALUES(?,?,?,?,?,?)",
			dbUser, isAdmin, from.ID, chatID, nullable(from.Username), schedule.Timestamp()); err != nil {
			return err
		}
		return audit.Record(tx, name, "telegram.link", "@"+from.Username)
	})
	return name, err
}

// panelNameForTelegram maps a Telegram account to its linked panel user, if any.
func (s *Server) panelNameForTelegram(telegramUserID int64) (string, bool) {
	var userID sql.NullInt64
	var isAdmin bool
	if err := s.DB.QueryRow("SELECT user_id,is_admin FROM telegram_links WHERE telegram_user_id=?", telegramUserID).Scan(&userID, &isAdmin); err != nil {
		return "", false
	}
	if isAdmin {
		return s.Settings.AdminUsername, true
	}
	var name string
	if err := s.DB.QueryRow("SELECT username FROM users WHERE id=?", userID.Int64).Scan(&name); err != nil {
		return "", false
	}
	return name, true
}

func (s *Server) isLinkedChat(chatID int64) bool {
	var n int
	s.DB.QueryRow("SELECT COUNT(*) FROM telegram_links WHERE chat_id=?", chatID).Scan(&n)
	return n > 0
}
