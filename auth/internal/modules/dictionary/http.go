package dictionary

import (
	"auth/internal/modules/localization"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"auth/internal/common/apperror"
	"auth/internal/common/authn"
	"auth/internal/common/i18n"
	"auth/internal/common/report"
	"auth/internal/common/server"
	"auth/internal/modules"
	"github.com/go-chi/chi/v5"
)

var _ modules.HTTPModule = (*Module)(nil)
var _ modules.IdempotentHTTPModule = (*Module)(nil)

func (*Module) Name() string { return "/dictionary" }

func (*Module) Idempotent() bool { return true }

func (m *Module) HTTP() http.Handler {
	r := chi.NewRouter()
	r.Get("/", m.list)
	r.Get("/summary", m.summary)
	r.Get("/pub/i18n", m.localization)
	r.Get("/{id}", m.get)
	r.Post("/", m.create)
	r.Patch("/{id}", m.update)
	r.Delete("/{id}", m.delete)
	return r
}

func (m *Module) get(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

	if err != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.DictionaryID)
		return
	}
	value, cacheHit, err := m.getCached(r.Context(), id)
	if errors.Is(err, ErrInvalid) {
		server.WriteError(w, r, http.StatusBadRequest, ErrInvalid)
		return
	}
	if errors.Is(err, ErrNotFound) {
		server.WriteError(w, r, http.StatusNotFound, ErrNotFound)
		return
	}
	if err != nil {
		slog.ErrorContext(r.Context(), "get dictionary "+strconv.FormatInt(id, 10)+" failed: "+err.Error(), "operation", "get_dictionary", "outcome", "failure", "error", err, "dictionary_id", id)
		server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		return
	}
	if cacheHit {
		w.Header().Set("X-Cache-Hit", "1")
	}
	server.WriteOK(w, value)
}

func (m *Module) create(w http.ResponseWriter, r *http.Request) {

	var input CreateDictionaryInput
	if !decodeDictionaryInput(w, r, &input) {
		return
	}
	value, err := m.Create(r.Context(), input)
	if errors.Is(err, authn.ErrPermissionAdministrationRequired) || errors.Is(err, authn.ErrPermissionGrantRequired) {
		server.WriteError(w, r, http.StatusForbidden, err)
		return
	}
	if errors.Is(err, ErrInvalid) || errors.Is(err, ErrConflict) || errors.Is(err, ErrGroupNotEmpty) {
		server.WriteError(w, r, http.StatusBadRequest, err)
		return
	}
	if err != nil {
		slog.ErrorContext(r.Context(), "create dictionary failed: "+err.Error(), "operation", "create_dictionary", "outcome", "failure", "error", err)
		server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		return
	}
	server.WriteOK(w, value)
}

func (m *Module) update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

	if err != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.DictionaryID)
		return
	}
	var input UpdateDictionaryInput
	if !decodeDictionaryInput(w, r, &input) {
		return
	}
	value, err := m.Update(r.Context(), id, input)
	if errors.Is(err, ErrVersionConflict) {
		server.WriteError(w, r, http.StatusConflict, err)
		return
	}
	if errors.Is(err, authn.ErrPermissionAdministrationRequired) || errors.Is(err, authn.ErrPermissionGrantRequired) {
		server.WriteError(w, r, http.StatusForbidden, err)
		return
	}
	if errors.Is(err, ErrInvalid) || errors.Is(err, ErrConflict) || errors.Is(err, ErrGroupNotEmpty) {
		server.WriteError(w, r, http.StatusBadRequest, err)
		return
	}
	if errors.Is(err, ErrNotFound) {
		server.WriteError(w, r, http.StatusNotFound, ErrNotFound)
		return
	}
	if err != nil {
		slog.ErrorContext(r.Context(), "update dictionary "+strconv.FormatInt(id, 10)+" failed: "+err.Error(), "operation", "update_dictionary", "outcome", "failure", "error", err, "dictionary_id", id)
		server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		return
	}
	server.WriteOK(w, value)
}

func decodeDictionaryInput(w http.ResponseWriter, r *http.Request, input any) bool {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(input); err != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidBody)
		return false
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidBody)
		return false
	}
	return true
}

func (m *Module) delete(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(chi.URLParam(r, "id"), ",")

	if len(parts) > 100 {
		server.WriteError(w, r, http.StatusBadRequest, ErrIDs)
		return
	}
	ids := make([]int64, 0, len(parts))
	for _, part := range parts {
		id, err := strconv.ParseInt(strings.TrimSpace(part), 10, 64)
		if err != nil || id <= 0 {
			server.WriteError(w, r, http.StatusBadRequest, ErrIDs)
			return
		}
		ids = append(ids, id)
	}
	err := m.Delete(r.Context(), ids...)
	if errors.Is(err, authn.ErrPermissionAdministrationRequired) || errors.Is(err, authn.ErrPermissionGrantRequired) {
		server.WriteError(w, r, http.StatusForbidden, err)
		return
	}
	if errors.Is(err, ErrIDs) {
		server.WriteError(w, r, http.StatusBadRequest, ErrIDs)
		return
	}
	if errors.Is(err, ErrNotFound) {
		server.WriteError(w, r, http.StatusNotFound, ErrNotFound)
		return
	}
	if err != nil {
		slog.ErrorContext(r.Context(), "delete "+strconv.Itoa(len(ids))+" dictionaries failed: "+err.Error(), "operation", "delete_dictionaries", "outcome", "failure", "error", err, "count", len(ids))
		server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		return
	}
	server.WriteOK(w)
}

func (m *Module) list(w http.ResponseWriter, r *http.Request) {

	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
		return
	}
	fields, fieldErr := report.ParseFields(query, listFields...)
	if fieldErr != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
		return
	}
	input := ListDictionariesInput{Fields: fields, Key: query.Get("key"), Name: query.Get("name")}
	if values, provided := query["enabled"]; provided {
		if len(values) != 1 {
			server.WriteError(w, r, http.StatusBadRequest, apperror.DictionaryEnabled)
			return
		}
		parsed, err := strconv.ParseBool(values[0])
		if err != nil {
			server.WriteError(w, r, http.StatusBadRequest, apperror.DictionaryEnabled)
			return
		}
		input.Enabled = &parsed
	}
	if values, provided := query["p"]; provided {
		if len(values) != 1 {
			server.WriteError(w, r, http.StatusBadRequest, apperror.Page)
			return
		}
		parsed, err := strconv.ParseInt(values[0], 10, 32)
		if err != nil {
			server.WriteError(w, r, http.StatusBadRequest, apperror.Page)
			return
		}
		value := int32(parsed)
		input.Page = &value
	}
	if values, provided := query["s"]; provided {
		if len(values) != 1 {
			server.WriteError(w, r, http.StatusBadRequest, apperror.PageSize)
			return
		}
		parsed, err := strconv.ParseInt(values[0], 10, 32)
		if err != nil {
			server.WriteError(w, r, http.StatusBadRequest, apperror.PageSize)
			return
		}
		value := int32(parsed)
		input.PageSize = &value
	}
	value, err := m.List(r.Context(), input)
	if err != nil {
		slog.ErrorContext(r.Context(), "list dictionaries failed: "+err.Error(), "operation", "list_dictionaries", "outcome", "failure", "error", err)
		server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		return
	}
	server.WriteOK(w, value)
}

func (m *Module) summary(w http.ResponseWriter, r *http.Request) {

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
	fields, err := report.ParseFields(query, "total", "counts")
	if err != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
		return
	}
	value, err := m.Summary(r.Context(), fields...)
	if err != nil {
		slog.ErrorContext(r.Context(), "summarize dictionary failed: "+err.Error(), "operation", "summarize_dictionary", "outcome", "failure", "error", err)
		server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		return
	}
	server.WriteOK(w, value)
}

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

func (m *Module) Translator() i18n.Translator {
	if m == nil {
		return nil
	}
	translator, _ := m.catalogSource.(i18n.Translator)
	return translator
}
