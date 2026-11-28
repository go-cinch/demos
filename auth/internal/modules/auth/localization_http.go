package auth

import (
	"net/http"
	"net/url"

	"auth/internal/common/apperror"
	"auth/internal/common/report"
	"auth/internal/common/server"
	"auth/internal/modules/localization"
)

func (m *Module) localization(w http.ResponseWriter, r *http.Request) {

	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
		return
	}
	for key := range query {
		if key != "f" {
			server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
			return
		}
	}
	fields, err := report.ParseFields(query, "default_locale", "locales", "scopes", "operations", "group_order", "messages", "frontend_messages")
	if err != nil || (fields != nil && fields.Has("messages") && fields.Has("frontend_messages")) {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
		return
	}
	if fields == nil {
		fields = report.Fields{"default_locale", "locales"}
	}
	w.Header().Set("Cache-Control", "no-cache")
	var value localization.PublicCatalog = m.catalogSource.PublicCatalog(fields...)
	server.WriteOK(w, value)
}
