package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

// Request structure for OpenAI-compatible Chat API
type ChatRequest struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
	Stream   bool      `json:"stream"`
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Response structure
type ChatResponse struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Created int64  `json:"created"`
	Choices []struct {
		Index        int     `json:"index"`
		Message      Message `json:"message"`
		FinishReason string  `json:"finish_reason"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
}

func main() {
	// Configuration
	apiURL := "http://localhost:5002/v1/chat/completions"
	modelName := "default" // Llama.cpp server usually ignores this or treats as default

	// Prepare the request payload
	reqBody := ChatRequest{
		Model: modelName,
		Messages: []Message{
			{Role: "user", Content: "Hello! Who are you?"},
		},
		Stream: false,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		log.Fatalf("Error marshaling request: %v", err)
	}

	// Create HTTP request
	req, err := http.NewRequest("POST", apiURL, bytes.NewBuffer(jsonData))
	if err != nil {
		log.Fatalf("Error creating request: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer sk-no-key-required") // Llama.cpp doesn't strictly need this but good practice

	// Send request
	client := &http.Client{Timeout: 120 * time.Second} // Increased timeout for large model loading/thinking
	fmt.Printf("Sending request to %s...\n", apiURL)

	start := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		log.Fatalf("Error sending request: %v", err)
	}
	defer resp.Body.Close()
	duration := time.Since(start)

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Fatalf("Error reading response: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		log.Fatalf("API Error: Status %d\nBody: %s", resp.StatusCode, string(body))
	}

	// Parse response
	var chatResp ChatResponse
	if err := json.Unmarshal(body, &chatResp); err != nil {
		log.Fatalf("Error parsing JSON response: %v", err)
	}

	// Print result
	if len(chatResp.Choices) > 0 {
		fmt.Printf("\n--- Model Response (took %v) ---\n", duration)
		fmt.Println(chatResp.Choices[0].Message.Content)
		fmt.Println("-------------------------------------")
		fmt.Printf("Usage: %d prompt tokens, %d completion tokens\n",
			chatResp.Usage.PromptTokens, chatResp.Usage.CompletionTokens)
	} else {
		fmt.Println("No choices returned in response.")
	}
}
