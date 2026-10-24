package app

import "invoice-keeper/internal/app/security"

// checkPassword records a weak-password error on the form field.
func checkPassword(f *form, field string, password *string, username string) {
	if password == nil {
		return
	}
	if reason := security.WeakPasswordReason(*password, username); reason != "" {
		f.add(field, reason, "password_weak")
	}
}
