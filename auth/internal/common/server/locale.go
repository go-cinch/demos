package server

import (
	"auth/internal/common/i18n"
	"net/http"
)

func Locale(translators ...i18n.Translator) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()
			if len(translators) > 0 {
				ctx = i18n.WithTranslator(ctx, translators[0])
			}
			locale := i18n.Locale(ctx, r.Header.Get("Accept-Language"))
			w.Header().Set("Content-Language", locale)
			w.Header().Add("Vary", "Accept-Language")
			next.ServeHTTP(w, r.WithContext(i18n.WithLocale(ctx, locale)))
		})
	}
}
