package action

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"

	"auth/internal/common/pagination"
	"auth/internal/common/report"
	"auth/internal/infra/db"
)

func TestListFieldProjection(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	// Nil association modules make accidental enrichment fail immediately.
	m := &Module{store: &db.Store{DB: database}, limits: pagination.Limits{MaxP: 10000, MaxS: 10000}}
	input := ListActionsInput{Fields: report.Fields{"resource"}}
	mock.ExpectQuery("SELECT COUNT.*FROM t_action").WillReturnRows(sqlmock.NewRows([]string{"total"}).AddRow(1))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT resource FROM t_action")).WillReturnRows(sqlmock.NewRows([]string{"resource"}).AddRow(""))
	value, err := m.List(t.Context(), input)
	if err != nil {
		t.Fatal(err)
	}
	if len(value.Items) != 1 {
		t.Fatalf("items: %+v", value)
	}
	encoded, err := json.Marshal(value.Items[0])
	if err != nil || string(encoded) != `{"resource":""}` {
		t.Fatalf("projection: %s %v", encoded, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
	for _, fields := range []report.Fields{
		{}, {"unknown"}, {"resource", "resource"}} {
		input.Fields = fields
		if _, err := m.List(t.Context(), input); err == nil {
			t.Fatal("accepted invalid selector")
		}
	}

	handler := m.HTTP()

	for _, query := range []string{"f=", "f=unknown", "f=resource,resource", "f=resource,", "f=resource&f=resource", "f=Key"} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/?"+query, nil))
		if response.Code != 400 {
			t.Fatalf("%s: %d %s", query, response.Code, response.Body.String())
		}
	}
	// An empty selected page retains the normal pagination envelope.
	input.Fields = report.Fields{"resource"}
	mock.ExpectQuery("SELECT COUNT.*FROM t_action").WillReturnRows(sqlmock.NewRows([]string{"total"}).AddRow(0))

	value, err = m.List(t.Context(), input)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err = json.Marshal(value)
	if err != nil || string(encoded) != `{"items":[],"t":0,"p":1,"s":1}` {
		t.Fatalf("empty page: %s %v", encoded, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
