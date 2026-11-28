package server

import (
	"auth/internal/common/config"
	"context"
	"net/http"
)

type BodyLimit string

const (
	BodyAuthChallenge    BodyLimit = "authChallenge"
	BodySliderChallenge  BodyLimit = "sliderChallenge"
	BodyAuthVerification BodyLimit = "authVerification"
	BodyAuth             BodyLimit = "auth"
	BodyBusiness         BodyLimit = "business"
	BodyDictionary       BodyLimit = "dictionary"
)

type bodyLimitsKey struct{}

// RequestBodyLimits carries one router's immutable limits to its HTTP decoders.
func RequestBodyLimits(limits config.HTTPBodyLimitsConfig) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), bodyLimitsKey{}, limits)))
		})
	}
}
func requestBodyLimit(r *http.Request, category BodyLimit) int64 {
	limits, ok := r.Context().Value(bodyLimitsKey{}).(config.HTTPBodyLimitsConfig)
	if !ok {
		limits = config.DefaultHTTPBodyLimits()
	}
	switch category {
	case BodyAuthChallenge:
		return int64(limits.AuthChallenge)
	case BodySliderChallenge:
		return int64(limits.SliderChallenge)
	case BodyAuthVerification:
		return int64(limits.AuthVerification)
	case BodyAuth:
		return int64(limits.Auth)
	case BodyBusiness:
		return int64(limits.Business)
	case BodyDictionary:
		return int64(limits.Dictionary)
	default:
		return 0
	}
}
