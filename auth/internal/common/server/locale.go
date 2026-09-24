package server

import (
	"auth/internal/common/i18n"
	"net/http"
)

func Locale() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			locale := i18n.Match(r.Header.Get("Accept-Language"))
			w.Header().Set("Content-Language", locale)
			w.Header().Add("Vary", "Accept-Language")
			next.ServeHTTP(w, r.WithContext(i18n.WithLocale(r.Context(), locale)))
		})
	}
}
