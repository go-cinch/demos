package user

import (
	"auth/internal/common/apperror"
	"auth/internal/common/server"
	"auth/internal/modules"
	authmodule "auth/internal/modules/auth"
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

type CreateUserRequest struct {
	ChallengeID string         `json:"challenge_id" example:"u7rUnVYJdWzvX41WeyuR1J6mM8Xr0jYjNQQHf9U5gEo"`
	Credential  string         `json:"credential" example:"eyJhbGciOiJSU0EtT0FFUC0yNTYiLCJlbmMiOiJBMjU2R0NNIn0..."`
	Username    string         `json:"username" example:"operator"`
	RoleID      *int64         `json:"role_id,omitempty"`
	ActionCodes []string       `json:"action_codes,omitempty"`
	Metadata    map[string]any `json:"metadata,omitempty"`
}

type UpdateUserRequest struct {
	ChallengeID *string         `json:"challenge_id,omitempty" example:"u7rUnVYJdWzvX41WeyuR1J6mM8Xr0jYjNQQHf9U5gEo"`
	Credential  *string         `json:"credential,omitempty" example:"eyJhbGciOiJSU0EtT0FFUC0yNTYiLCJlbmMiOiJBMjU2R0NNIn0..."`
	Username    *string         `json:"username,omitempty"`
	RoleID      *int64          `json:"role_id,omitempty"`
	ActionCodes *[]string       `json:"action_codes,omitempty"`
	Status      *int16          `json:"status,omitempty"`
	Metadata    *map[string]any `json:"metadata,omitempty"`
}

func (*Module) Name() string { return "/user" }

func (*Module) Idempotent() bool { return true }

func (m *Module) HTTP() http.Handler {
	r := chi.NewRouter()
	r.Get("/", m.list)
	r.Get("/{id}", m.get)
	r.Post("/", m.create)
	r.Patch("/{id}", m.update)
	r.Delete("/{id}", m.delete)
	return r
}

func (m *Module) get(w http.ResponseWriter, r *http.Request) {

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

	if err != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.UserID)
		return
	}
	value, err := m.Get(r.Context(), id)
	if errors.Is(err, ErrInvalid) {
		server.WriteError(w, r, http.StatusBadRequest, ErrInvalid)
		return
	}
	if errors.Is(err, ErrNotFound) {
		server.WriteError(w, r, http.StatusNotFound, ErrNotFound)
		return
	}
	if err != nil {
		slog.ErrorContext(r.Context(), r.Method+" "+r.URL.Path+" failed: "+err.Error())
		server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		return
	}
	server.WriteOK(w, value)
}

func (m *Module) create(w http.ResponseWriter, r *http.Request) {

	var request CreateUserRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidBody)
		return
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidBody)
		return
	}
	password, err := m.registrationCredentials.OpenRegistrationPassword(r.Context(), authmodule.EncryptedRegisterInput{
		ChallengeID: request.ChallengeID,
		Credential:  request.Credential,
	})
	if errors.Is(err, authmodule.ErrInvalidRegistrationCredential) {
		server.WriteError(w, r, http.StatusBadRequest, authmodule.ErrInvalidRegistrationCredential)
		return
	}
	if err != nil {
		slog.ErrorContext(r.Context(), "decrypt user creation credential failed: "+err.Error())
		server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		return
	}
	input := CreateUserInput{
		Username:    request.Username,
		Password:    password,
		RoleID:      request.RoleID,
		ActionCodes: request.ActionCodes,
		Metadata:    request.Metadata,
	}
	value, err := m.Create(r.Context(), input)
	if errors.Is(err, ErrInvalid) || errors.Is(err, ErrConflict) {
		server.WriteError(w, r, http.StatusBadRequest, err)
		return
	}
	if errors.Is(err, ErrRoleNotFound) {
		server.WriteError(w, r, http.StatusNotFound, ErrRoleNotFound)
		return
	}
	if errors.Is(err, ErrActionNotFound) {
		server.WriteError(w, r, http.StatusNotFound, ErrActionNotFound)
		return
	}
	if err != nil {
		slog.ErrorContext(r.Context(), r.Method+" "+r.URL.Path+" failed: "+err.Error())
		server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		return
	}
	server.WriteOK(w, value)
}

func (m *Module) update(w http.ResponseWriter, r *http.Request) {

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

	if err != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.UserID)
		return
	}
	var request UpdateUserRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidBody)
		return
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidBody)
		return
	}
	input := UpdateUserInput{
		Username:    request.Username,
		RoleID:      request.RoleID,
		ActionCodes: request.ActionCodes,
		Status:      request.Status,
		Metadata:    request.Metadata,
	}
	if request.ChallengeID != nil || request.Credential != nil {
		challengeID, credential := "", ""
		if request.ChallengeID != nil {
			challengeID = *request.ChallengeID
		}
		if request.Credential != nil {
			credential = *request.Credential
		}
		password, err := m.registrationCredentials.OpenRegistrationPassword(r.Context(), authmodule.EncryptedRegisterInput{
			ChallengeID: challengeID,
			Credential:  credential,
		})
		if errors.Is(err, authmodule.ErrInvalidRegistrationCredential) {
			server.WriteError(w, r, http.StatusBadRequest, authmodule.ErrInvalidRegistrationCredential)
			return
		}
		if err != nil {
			slog.ErrorContext(r.Context(), "decrypt user update credential failed: "+err.Error())
			server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
			return
		}
		input.Password = &password
	}
	value, err := m.Update(r.Context(), id, input)
	if errors.Is(err, apperror.FeatureDisabled) {
		server.WriteError(w, r, http.StatusForbidden, err)
		return
	}
	if errors.Is(err, ErrInvalid) || errors.Is(err, ErrConflict) {
		server.WriteError(w, r, http.StatusBadRequest, err)
		return
	}
	if errors.Is(err, ErrNotFound) {
		server.WriteError(w, r, http.StatusNotFound, ErrNotFound)
		return
	}
	if errors.Is(err, ErrRoleNotFound) {
		server.WriteError(w, r, http.StatusNotFound, ErrRoleNotFound)
		return
	}
	if errors.Is(err, ErrActionNotFound) {
		server.WriteError(w, r, http.StatusNotFound, ErrActionNotFound)
		return
	}
	if err != nil {
		slog.ErrorContext(r.Context(), r.Method+" "+r.URL.Path+" failed: "+err.Error())
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
	if errors.Is(err, apperror.FeatureDisabled) {
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
		slog.ErrorContext(r.Context(), r.Method+" "+r.URL.Path+" failed: "+err.Error())
		server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		return
	}
	server.WriteOK(w)
}

func (m *Module) list(w http.ResponseWriter, r *http.Request) {

	if _, err := url.ParseQuery(r.URL.RawQuery); err != nil {
		server.WriteError(w, r, http.StatusBadRequest, apperror.InvalidQuery)
		return
	}
	query := r.URL.Query()
	input := ListUsersInput{Username: query.Get("username"), Code: query.Get("code")}
	if values, provided := query["status"]; provided {
		if len(values) != 1 {
			server.WriteError(w, r, http.StatusBadRequest, apperror.UserStatus)
			return
		}
		statuses, ok := parseStatuses(values[0])
		if !ok {
			server.WriteError(w, r, http.StatusBadRequest, apperror.UserStatus)
			return
		}
		input.Statuses = statuses
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
	if errors.Is(err, ErrInvalid) {
		server.WriteError(w, r, http.StatusBadRequest, ErrInvalid)
		return
	}
	if err != nil {
		slog.ErrorContext(r.Context(), "list users failed: "+err.Error())
		server.WriteError(w, r, http.StatusInternalServerError, apperror.Internal)
		return
	}
	server.WriteOK(w, value)
}

func parseStatuses(value string) ([]int16, bool) {
	result := make([]int16, 0)
	seen := make(map[int16]struct{})
	for _, item := range strings.Split(value, ",") {
		parsed, err := strconv.ParseInt(strings.TrimSpace(item), 10, 16)
		status := int16(parsed)
		if err != nil || !validStatus(status) {
			return nil, false
		}
		if _, ok := seen[status]; ok {
			continue
		}
		seen[status] = struct{}{}
		result = append(result, status)
	}
	return result, len(result) > 0
}
