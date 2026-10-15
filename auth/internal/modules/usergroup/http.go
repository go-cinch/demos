package usergroup

import (
	"auth/internal/common/apperror"
	"auth/internal/common/report"
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
	"strings"
)

var _ modules.HTTPModule = (*Module)(nil)
var _ modules.IdempotentHTTPModule = (*Module)(nil)

func (*Module) Name() string { return "/user-group" }

func (*Module) Idempotent() bool { return true }

func (m *Module) HTTP() http.Handler {
	r := chi.NewRouter()
	r.Get("/", m.list)
	r.Get("/summary", m.summary)
	r.Get("/{id}", m.get)
	r.Get("/{id}/member", m.members)
	r.Post("/", m.create)
	r.Patch("/{id}", m.update)
	r.Delete("/{id}", m.delete)
	return r
}

func (m *Module) get(w http.ResponseWriter, r *http.Request) {

	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
		return
	}
	fields, err := report.ParseFields(query, "actions", "users", "member_count", "member_preview")
	if err != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

	if err != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.UserGroupID)
		return
	}
	value, err := m.Get(r.Context(), id, fields...)
	if errors.Is(err, ErrInvalid) {
		server.WriteError(w, r, http.StatusBadRequest, ErrInvalid)
		return
	}
	if errors.Is(err, ErrNotFound) {
		server.WriteError(w, r, http.StatusNotFound, ErrNotFound)
		return
	}
	if err != nil {
		slog.ErrorContext(r.Context(), "get user group "+strconv.FormatInt(id, 10)+" failed: "+err.Error(), "operation", "get_user_group", "outcome", "failure", "error", err, "user_group_id", id)
		server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		return
	}
	server.WriteOK(w, value)
}

func (m *Module) create(w http.ResponseWriter, r *http.Request) {

	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
		return
	}
	fields, err := report.ParseFields(query, "actions", "users", "member_count", "member_preview")
	if err != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
		return
	}

	var input CreateUserGroupInput
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
	value, err := m.Create(r.Context(), input, fields...)
	if errors.Is(err, ErrInvalid) || errors.Is(err, ErrConflict) {
		server.WriteError(w, r, http.StatusBadRequest, err)
		return
	}
	if errors.Is(err, ErrUserNotFound) {
		server.WriteError(w, r, http.StatusNotFound, ErrUserNotFound)
		return
	}
	if errors.Is(err, ErrActionNotFound) {
		server.WriteError(w, r, http.StatusNotFound, ErrActionNotFound)
		return
	}
	if err != nil {
		slog.ErrorContext(r.Context(), "create user group failed: "+err.Error(), "operation", "create_user_group", "outcome", "failure", "error", err)
		server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		return
	}
	server.WriteOK(w, value)
}

func (m *Module) update(w http.ResponseWriter, r *http.Request) {

	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
		return
	}
	fields, err := report.ParseFields(query, "actions", "users", "member_count", "member_preview")
	if err != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

	if err != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.UserGroupID)
		return
	}
	var input UpdateUserGroupInput
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
	value, err := m.Update(r.Context(), id, input, fields...)
	if errors.Is(err, ErrInvalid) || errors.Is(err, ErrConflict) {
		server.WriteError(w, r, http.StatusBadRequest, err)
		return
	}
	if errors.Is(err, ErrNotFound) {
		server.WriteError(w, r, http.StatusNotFound, ErrNotFound)
		return
	}
	if errors.Is(err, ErrUserNotFound) {
		server.WriteError(w, r, http.StatusNotFound, ErrUserNotFound)
		return
	}
	if errors.Is(err, ErrActionNotFound) {
		server.WriteError(w, r, http.StatusNotFound, ErrActionNotFound)
		return
	}
	if err != nil {
		slog.ErrorContext(r.Context(), "update user group "+strconv.FormatInt(id, 10)+" failed: "+err.Error(), "operation", "update_user_group", "outcome", "failure", "error", err, "user_group_id", id)
		server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		return
	}
	server.WriteOK(w, value)
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
	if errors.Is(err, ErrIDs) {
		server.WriteError(w, r, http.StatusBadRequest, ErrIDs)
		return
	}
	if errors.Is(err, ErrNotFound) {
		server.WriteError(w, r, http.StatusNotFound, ErrNotFound)
		return
	}
	if err != nil {
		slog.ErrorContext(r.Context(), "delete "+strconv.Itoa(len(ids))+" user groups failed: "+err.Error(), "operation", "delete_user_groups", "outcome", "failure", "error", err, "count", len(ids))
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
	fields, err := parseListFields(query)
	if err != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
		return
	}
	input := ListUserGroupsInput{Fields: fields, Name: query.Get("name"), Word: query.Get("word"), ActionCode: query.Get("action_code")}
	if values, provided := query["has_permissions"]; provided {
		if len(values) != 1 || (values[0] != "true" && values[0] != "false") {
			server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
			return
		}
		parsed, _ := strconv.ParseBool(values[0])
		input.HasPermissions = &parsed
	}
	if values, provided := query["has_members"]; provided {
		if len(values) != 1 || (values[0] != "true" && values[0] != "false") {
			server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
			return
		}
		parsed, _ := strconv.ParseBool(values[0])
		input.HasMembers = &parsed
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
		slog.ErrorContext(r.Context(), "list user groups failed: "+err.Error(), "operation", "list_user_groups", "outcome", "failure", "error", err)
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
	fields, err := report.ParseFields(query, "total", "counts", "groups")
	if err != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
		return
	}
	value, err := m.Summary(r.Context(), fields...)
	if err != nil {
		slog.ErrorContext(r.Context(), "summarize user groups failed: "+err.Error(), "operation", "summarize_user_groups", "outcome", "failure", "error", err)
		server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		return
	}
	server.WriteOK(w, value)
}

func (m *Module) members(w http.ResponseWriter, r *http.Request) {

	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

	if err != nil || id <= 0 {
		server.WriteError(w, r, http.StatusBadRequest, apperror.UserGroupID)
		return
	}
	input := ListMembersInput{Q: query.Get("q")}
	if values, provided := query["q"]; provided && len(values) != 1 {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
		return
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
	value, err := m.ListMembers(r.Context(), id, input)
	if errors.Is(err, ErrNotFound) {
		server.WriteError(w, r, http.StatusNotFound, err)
		return
	}
	if errors.Is(err, ErrInvalid) {
		server.WriteError(w, r, http.StatusBadRequest, err)
		return
	}
	if err != nil {
		slog.ErrorContext(r.Context(), "list group members failed: "+err.Error(), "operation", "list_group_members", "outcome", "failure", "error", err, "user_group_id", id)
		server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		return
	}
	server.WriteOK(w, value)
}

func parseListFields(query url.Values) (report.Fields, error) {
	fields, err := report.ParseFields(query, append(append([]string{}, listFields...), "actions", "users", "member_count", "member_preview")...)
	if err != nil || fields == nil {
		return fields, err
	}
	return fields, nil
}
