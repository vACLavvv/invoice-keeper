package security

// Weak password checks on top of the 12-character minimum: passwords that are known from leaks
// (no network calls — an embedded list), contain the login, or are a run of the same characters,
// keyboard rows or digit sequences.

import (
	_ "embed"
	"strings"
	"unicode"
)

//go:embed wordlists/common-passwords.txt
var commonPasswordsText string

// commonBases are frequent short passwords: "password" + "2024!" is still a guessable password.
//
//go:embed wordlists/common-bases.txt
var commonBasesText string

func wordSet(text string) map[string]bool {
	set := map[string]bool{}
	for _, line := range strings.Split(text, "\n") {
		if line = strings.TrimSpace(line); line != "" && !strings.HasPrefix(line, "#") {
			set[line] = true
		}
	}
	return set
}

var commonPasswords, commonBases = wordSet(commonPasswordsText), wordSet(commonBasesText)

var sequences = []string{
	"0123456789012345678901234567890",
	"abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz",
	"qwertyuiopasdfghjklzxcvbnmqwertyuiop",
	"йцукенгшщзхъфывапролджэячсмитьбю",
	"1qaz2wsx3edc4rfv5tgb6yhn7ujm",
}

// WeakPasswordReason explains why a password is weak, or returns "" for an acceptable one.
func WeakPasswordReason(password, username string) string {
	lower := strings.ToLower(password)
	if commonPasswords[lower] {
		return "Этот пароль есть в списках утёкших паролей. Придумайте другой"
	}
	// "Common password + digits or symbols at the end" is just as easy to guess.
	base := strings.TrimRightFunc(lower, func(r rune) bool { return unicode.IsDigit(r) || unicode.IsPunct(r) || unicode.IsSymbol(r) })
	if base != lower && (commonPasswords[base] || commonBases[base]) {
		return "Пароль — известный утёкший пароль с цифрами или символами в конце. Придумайте другой"
	}
	if login := strings.ToLower(strings.TrimSpace(username)); len([]rune(login)) >= 3 && strings.Contains(lower, login) {
		return "Пароль не должен содержать логин"
	}
	distinct := map[rune]bool{}
	for _, r := range lower {
		distinct[r] = true
	}
	if len(distinct) < 5 {
		return "В пароле слишком мало разных символов"
	}
	for _, sequence := range sequences {
		reversed := []rune(sequence)
		for i, j := 0, len(reversed)-1; i < j; i, j = i+1, j-1 {
			reversed[i], reversed[j] = reversed[j], reversed[i]
		}
		if strings.Contains(sequence, lower) || strings.Contains(string(reversed), lower) {
			return "Пароль — подряд идущие символы клавиатуры или алфавита. Придумайте другой"
		}
	}
	return ""
}
