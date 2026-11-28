package auth

import (
	"auth/internal/modules/dictionary"
	"context"
	"errors"
)

type TimezoneSource interface {
	TimezoneOptions(context.Context) (dictionary.TimezoneCatalog, error)
}

func (m *Module) SetTimezoneSource(source TimezoneSource) { m.timezoneSource = source }

func (m *Module) TimezoneOptions(ctx context.Context) (dictionary.TimezoneCatalog, error) {
	if m.timezoneSource == nil {
		return dictionary.TimezoneCatalog{}, errors.New("timezone source is unavailable")
	}
	return m.timezoneSource.TimezoneOptions(ctx)
}
