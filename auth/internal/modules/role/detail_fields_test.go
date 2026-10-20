package role

import (
	"auth/internal/common/report"
	"database/sql"
	"encoding/json"
	"errors"
	"github.com/DATA-DOG/go-sqlmock"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDetailSelectionSkipsAssociations(t *testing.T) {
	m, mock := newTestModule(t)
	mock.ExpectQuery("SELECT id FROM t_role WHERE id").WithArgs(int64(7)).WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(7))
	value, err := m.GetSelected(t.Context(), 7, report.Fields{"id"})
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(value)
	if err != nil || string(encoded) != `{"id":7}` {
		t.Fatal(string(encoded), err)
	}
	for _, fields := range []report.Fields{{}, {"unknown"}, {"id", "id"}} {
		if _, err := m.GetSelected(t.Context(), 7, fields); err == nil {
			t.Fatal("accepted invalid selector", fields)
		}
	}
	if _, err := m.GetSelected(t.Context(), 0, report.Fields{"id"}); !errors.Is(err, ErrInvalid) {
		t.Fatal(err)
	}
	mock.ExpectQuery("SELECT id FROM t_role WHERE id").WillReturnError(sql.ErrNoRows)
	if _, err := m.GetSelected(t.Context(), 7, report.Fields{"id"}); !errors.Is(err, ErrNotFound) {
		t.Fatal(err)
	}
	mock.ExpectQuery("SELECT id FROM t_role WHERE id").WillReturnError(sqlmock.ErrCancelled)
	if _, err := m.GetSelected(t.Context(), 7, report.Fields{"id"}); err == nil || errors.Is(err, ErrNotFound) {
		t.Fatal(err)
	}
}

func TestDetailHTTPSelectorsBeforeSQL(t *testing.T) {
	m, mock := newTestModule(t)

	handler := m.HTTP()

	for _, q := range []string{"f=", "f=unknown", "f=id,id", "f=id&f=id", "broken=%ZZ"} {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/7?"+q, nil))
		if w.Code != 400 {
			t.Fatal(q, w.Code, w.Body.String())
		}
	}
	mock.ExpectQuery("SELECT id FROM t_role WHERE id").WithArgs(int64(7)).WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(7))
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/7?f=id", nil))
	if w.Code != 200 || strings.TrimSpace(w.Body.String()) != `{"id":7}` {
		t.Fatal(w.Code, w.Body.String())
	}
}
