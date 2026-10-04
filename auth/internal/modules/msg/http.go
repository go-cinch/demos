package msg

import (
	"auth/internal/common/apperror"
	"auth/internal/common/authn"
	"auth/internal/common/server"
	"auth/internal/modules"
	"encoding/json"
	"errors"
	"github.com/go-chi/chi/v5"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
)

var _ modules.HTTPModule = (*Module)(nil)
var _ modules.IdempotentHTTPModule = (*Module)(nil)

func (*Module) Name() string { return "/msg" }

func (*Module) Idempotent() bool { return true }

func (m *Module) HTTP() http.Handler {
	r := chi.NewRouter()
	r.Get("/inbox", m.listInbox)
	r.Get("/inbox/{id}", m.getInbox)
	r.Patch("/inbox/{id}", m.read)
	r.Delete("/inbox/{id}", m.deleteInbox)
	r.Post("/inbox/read-all", m.readAll)
	r.Get("/unread-count", m.unreadCount)
	r.Post("/", m.create)
	r.Get("/sent", m.listSent)
	r.Get("/sent/{id}", m.getSent)
	r.Delete("/sent/{id}", m.deleteSent)
	r.Get("/recipient-option", m.recipientOptions)
	return r
}

func (m *Module) create(w http.ResponseWriter, r *http.Request) {

	identity, ok := authn.FromContext(r.Context())
	if !ok {
		server.WriteError(w, r, http.StatusUnauthorized, apperror.Unauthorized)
		return
	}
	var input CreateInput
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidBody)
		return
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidBody)
		return
	}
	value, err := m.Create(r.Context(), identity.UserID, input)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalid), errors.Is(err, ErrRecipient):
			server.WriteError(w, r, http.StatusBadRequest, err)
		case errors.Is(err, ErrNotFound):
			server.WriteError(w, r, http.StatusNotFound, err)
		default:
			slog.ErrorContext(r.Context(), r.Method+" "+r.URL.Path+" failed: "+err.Error())
			server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		}
		return
	}
	server.WriteOK(w, value)
}

func (m *Module) getInbox(w http.ResponseWriter, r *http.Request) {

	identity, ok := authn.FromContext(r.Context())
	if !ok {
		server.WriteError(w, r, http.StatusUnauthorized, apperror.Unauthorized)
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

	if err != nil || id <= 0 {
		server.WriteError(w, r, http.StatusBadRequest, ErrInvalid)
		return
	}
	value, err := m.Get(r.Context(), identity.UserID, id)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalid), errors.Is(err, ErrRecipient):
			server.WriteError(w, r, http.StatusBadRequest, err)
		case errors.Is(err, ErrNotFound):
			server.WriteError(w, r, http.StatusNotFound, err)
		default:
			slog.ErrorContext(r.Context(), r.Method+" "+r.URL.Path+" failed: "+err.Error())
			server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		}
		return
	}
	server.WriteOK(w, value)
}

func (m *Module) getSent(w http.ResponseWriter, r *http.Request) {

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

	if err != nil || id <= 0 {
		server.WriteError(w, r, http.StatusBadRequest, ErrInvalid)
		return
	}
	value, err := m.GetSent(r.Context(), id)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalid), errors.Is(err, ErrRecipient):
			server.WriteError(w, r, http.StatusBadRequest, err)
		case errors.Is(err, ErrNotFound):
			server.WriteError(w, r, http.StatusNotFound, err)
		default:
			slog.ErrorContext(r.Context(), r.Method+" "+r.URL.Path+" failed: "+err.Error())
			server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		}
		return
	}
	server.WriteOK(w, value)
}

func (m *Module) read(w http.ResponseWriter, r *http.Request) {

	identity, ok := authn.FromContext(r.Context())
	if !ok {
		server.WriteError(w, r, http.StatusUnauthorized, apperror.Unauthorized)
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

	if err != nil || id <= 0 {
		server.WriteError(w, r, http.StatusBadRequest, ErrInvalid)
		return
	}
	var input struct {
		Read *bool `json:"read"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidBody)
		return
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidBody)
		return
	}
	if input.Read == nil || !*input.Read {
		server.WriteError(w, r, http.StatusBadRequest, ErrInvalid)
		return
	}
	err = m.Read(r.Context(), identity.UserID, id)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalid), errors.Is(err, ErrRecipient):
			server.WriteError(w, r, http.StatusBadRequest, err)
		case errors.Is(err, ErrNotFound):
			server.WriteError(w, r, http.StatusNotFound, err)
		default:
			slog.ErrorContext(r.Context(), r.Method+" "+r.URL.Path+" failed: "+err.Error())
			server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		}
		return
	}
	server.WriteOK(w)
}

func (m *Module) deleteInbox(w http.ResponseWriter, r *http.Request) {

	identity, ok := authn.FromContext(r.Context())
	if !ok {
		server.WriteError(w, r, http.StatusUnauthorized, apperror.Unauthorized)
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

	if err != nil || id <= 0 {
		server.WriteError(w, r, http.StatusBadRequest, ErrInvalid)
		return
	}
	err = m.Delete(r.Context(), identity.UserID, id)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalid), errors.Is(err, ErrRecipient):
			server.WriteError(w, r, http.StatusBadRequest, err)
		case errors.Is(err, ErrNotFound):
			server.WriteError(w, r, http.StatusNotFound, err)
		default:
			slog.ErrorContext(r.Context(), r.Method+" "+r.URL.Path+" failed: "+err.Error())
			server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		}
		return
	}
	server.WriteOK(w)
}

func (m *Module) deleteSent(w http.ResponseWriter, r *http.Request) {

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

	if err != nil || id <= 0 {
		server.WriteError(w, r, http.StatusBadRequest, ErrInvalid)
		return
	}
	err = m.DeleteSent(r.Context(), id)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalid), errors.Is(err, ErrRecipient):
			server.WriteError(w, r, http.StatusBadRequest, err)
		case errors.Is(err, ErrNotFound):
			server.WriteError(w, r, http.StatusNotFound, err)
		default:
			slog.ErrorContext(r.Context(), r.Method+" "+r.URL.Path+" failed: "+err.Error())
			server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		}
		return
	}
	server.WriteOK(w)
}

func (m *Module) readAll(w http.ResponseWriter, r *http.Request) {

	identity, ok := authn.FromContext(r.Context())
	if !ok {
		server.WriteError(w, r, http.StatusUnauthorized, apperror.Unauthorized)
		return
	}
	err := m.ReadAll(r.Context(), identity.UserID)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalid), errors.Is(err, ErrRecipient):
			server.WriteError(w, r, http.StatusBadRequest, err)
		case errors.Is(err, ErrNotFound):
			server.WriteError(w, r, http.StatusNotFound, err)
		default:
			slog.ErrorContext(r.Context(), r.Method+" "+r.URL.Path+" failed: "+err.Error())
			server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		}
		return
	}
	server.WriteOK(w)
}

func (m *Module) unreadCount(w http.ResponseWriter, r *http.Request) {

	identity, ok := authn.FromContext(r.Context())
	if !ok {
		server.WriteError(w, r, http.StatusUnauthorized, apperror.Unauthorized)
		return
	}
	count, err := m.UnreadCount(r.Context(), identity.UserID)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalid), errors.Is(err, ErrRecipient):
			server.WriteError(w, r, http.StatusBadRequest, err)
		case errors.Is(err, ErrNotFound):
			server.WriteError(w, r, http.StatusNotFound, err)
		default:
			slog.ErrorContext(r.Context(), r.Method+" "+r.URL.Path+" failed: "+err.Error())
			server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		}
		return
	}
	server.WriteOK(w, struct {
		Count int64 `json:"count"`
	}{Count: count})
}

func (m *Module) recipientOptions(w http.ResponseWriter, r *http.Request) {

	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil || len(query["q"]) > 1 {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
		return
	}
	value, err := m.RecipientOptions(r.Context(), query.Get("q"))
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalid), errors.Is(err, ErrRecipient):
			server.WriteError(w, r, http.StatusBadRequest, err)
		case errors.Is(err, ErrNotFound):
			server.WriteError(w, r, http.StatusNotFound, err)
		default:
			slog.ErrorContext(r.Context(), r.Method+" "+r.URL.Path+" failed: "+err.Error())
			server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		}
		return
	}
	server.WriteOK(w, value)
}

func (m *Module) listInbox(w http.ResponseWriter, r *http.Request) {

	identity, ok := authn.FromContext(r.Context())
	if !ok {
		server.WriteError(w, r, http.StatusUnauthorized, apperror.Unauthorized)
		return
	}
	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
		return
	}
	input := ListInput{Type: query.Get("type"), Scope: query.Get("scope")}
	for _, key := range []string{"type", "scope"} {
		if values, provided := query[key]; provided && (len(values) != 1 || values[0] == "") {
			server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
			return
		}
	}
	if values, provided := query["p"]; provided {
		if len(values) != 1 {
			server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
			return
		}
		parsed, err := strconv.ParseInt(values[0], 10, 32)
		if err != nil {
			server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
			return
		}
		value := int32(parsed)
		input.Page = &value
	}
	if values, provided := query["s"]; provided {
		if len(values) != 1 {
			server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
			return
		}
		parsed, err := strconv.ParseInt(values[0], 10, 32)
		if err != nil {
			server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
			return
		}
		value := int32(parsed)
		input.PageSize = &value
	}
	if values, provided := query["read"]; provided {
		if len(values) != 1 || (values[0] != "true" && values[0] != "false") {
			server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
			return
		}
		value, _ := strconv.ParseBool(values[0])
		input.Read = &value
	}

	value, err := m.List(r.Context(), identity.UserID, input)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalid), errors.Is(err, ErrRecipient):
			server.WriteError(w, r, http.StatusBadRequest, err)
		case errors.Is(err, ErrNotFound):
			server.WriteError(w, r, http.StatusNotFound, err)
		default:
			slog.ErrorContext(r.Context(), r.Method+" "+r.URL.Path+" failed: "+err.Error())
			server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		}
		return
	}
	server.WriteOK(w, value)
}

func (m *Module) listSent(w http.ResponseWriter, r *http.Request) {

	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
		return
	}
	input := ListInput{Type: query.Get("type"), Scope: query.Get("scope")}
	for _, key := range []string{"type", "scope"} {
		if values, provided := query[key]; provided && (len(values) != 1 || values[0] == "") {
			server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
			return
		}
	}
	if values, provided := query["p"]; provided {
		if len(values) != 1 {
			server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
			return
		}
		parsed, err := strconv.ParseInt(values[0], 10, 32)
		if err != nil {
			server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
			return
		}
		value := int32(parsed)
		input.Page = &value
	}
	if values, provided := query["s"]; provided {
		if len(values) != 1 {
			server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
			return
		}
		parsed, err := strconv.ParseInt(values[0], 10, 32)
		if err != nil {
			server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
			return
		}
		value := int32(parsed)
		input.PageSize = &value
	}
	value, err := m.ListSent(r.Context(), input)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalid), errors.Is(err, ErrRecipient):
			server.WriteError(w, r, http.StatusBadRequest, err)
		case errors.Is(err, ErrNotFound):
			server.WriteError(w, r, http.StatusNotFound, err)
		default:
			slog.ErrorContext(r.Context(), r.Method+" "+r.URL.Path+" failed: "+err.Error())
			server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		}
		return
	}
	server.WriteOK(w, value)
}
