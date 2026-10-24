package app

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}
