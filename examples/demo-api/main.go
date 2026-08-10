// Command demo-api is a tiny, zero-dependency implementation of the E-Commerce
// Platform API used as a target for `microcks test`. Run it once and point the
// CLI at it instead of hand-rolling a stub each time.
//
//	go run .            # conforming responses  -> contract test PASSES
//	go run . -drift     # price returned as a string -> contract test FAILS
//	go run . -port 4000 # listen elsewhere (default :3001)
package main

import (
	"encoding/json"
	"flag"
	"log"
	"net/http"
)

// Product matches the ecommerce OpenAPI "Product" schema. Price is `any` so we
// can return it as a number (conforming) or a string (drifted) on demand.
type Product struct {
	ID             string         `json:"id"`
	Name           string         `json:"name"`
	Description    string         `json:"description,omitempty"`
	Price          any            `json:"price"`
	Category       string         `json:"category"`
	Brand          string         `json:"brand,omitempty"`
	Rating         float64        `json:"rating,omitempty"`
	StockQuantity  int            `json:"stockQuantity,omitempty"`
	Images         []string       `json:"images,omitempty"`
	Specifications map[string]any `json:"specifications,omitempty"`
	CreatedAt      string         `json:"createdAt,omitempty"`
	UpdatedAt      string         `json:"updatedAt,omitempty"`
}

type Pagination struct {
	Page       int  `json:"page"`
	Limit      int  `json:"limit"`
	Total      int  `json:"total"`
	TotalPages int  `json:"totalPages"`
	HasNext    bool `json:"hasNext"`
	HasPrev    bool `json:"hasPrev"`
}

type ProductList struct {
	Products   []Product  `json:"products"`
	Pagination Pagination `json:"pagination"`
}

var drift = flag.Bool("drift", false, "return a contract-violating response (price as a string) to demo a failing test")

func sampleProduct(id string) Product {
	p := Product{
		ID:             id,
		Name:           "Wireless Headphones",
		Description:    "Noise-cancelling over-ear headphones",
		Price:          199.99,
		Category:       "Electronics",
		Brand:          "TechAudio",
		Rating:         4.5,
		StockQuantity:  150,
		Images:         []string{"https://example.com/a.jpg"},
		Specifications: map[string]any{"batteryLife": "20h", "connectivity": "Bluetooth 5.0"},
		CreatedAt:      "2024-01-15T10:30:00Z",
		UpdatedAt:      "2024-01-20T14:45:00Z",
	}
	if *drift {
		p.Price = "199.99" // string violates `price: {type: number}` in the spec
	}
	return p
}

func main() {
	port := flag.String("port", "3001", "port to listen on")
	flag.Parse()

	addr := ":" + *port
	log.Printf("demo ecommerce API listening on http://localhost%s (drift=%v)", addr, *drift)
	log.Fatal(http.ListenAndServe(addr, newHandler()))
}

func newHandler() http.Handler {
	mux := http.NewServeMux()

	// GET /products -> ProductList
	mux.HandleFunc("GET /products", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, ProductList{
			Products:   []Product{sampleProduct("prod_001")},
			Pagination: Pagination{Page: 1, Limit: 20, Total: 1, TotalPages: 1},
		})
	})

	// GET /products/{productId} -> Product
	mux.HandleFunc("GET /products/{productId}", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, sampleProduct(r.PathValue("productId")))
	})

	return logRequests(mux)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func logRequests(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("%s %s", r.Method, r.URL.Path)
		h.ServeHTTP(w, r)
	})
}
