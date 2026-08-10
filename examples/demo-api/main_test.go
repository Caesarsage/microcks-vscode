package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestProductsResponseConforms(t *testing.T) {
	setDriftForTest(t, false)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/products", nil)
	newHandler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", response.Code)
	}
	var products ProductList
	if err := json.NewDecoder(response.Body).Decode(&products); err != nil {
		t.Fatal(err)
	}
	if len(products.Products) != 1 {
		t.Fatalf("expected one product, got %d", len(products.Products))
	}
	if _, ok := products.Products[0].Price.(float64); !ok {
		t.Fatalf("expected numeric price, got %T", products.Products[0].Price)
	}
}

func TestDriftReturnsStringPrice(t *testing.T) {
	setDriftForTest(t, true)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/products/prod_001", nil)
	newHandler().ServeHTTP(response, request)

	var product Product
	if err := json.NewDecoder(response.Body).Decode(&product); err != nil {
		t.Fatal(err)
	}
	if _, ok := product.Price.(string); !ok {
		t.Fatalf("expected drifted string price, got %T", product.Price)
	}
}

func setDriftForTest(t *testing.T, enabled bool) {
	t.Helper()
	previous := *drift
	*drift = enabled
	t.Cleanup(func() {
		*drift = previous
	})
}
