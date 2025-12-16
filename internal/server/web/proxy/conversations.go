package proxy

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/bricks-cloud/bricksllm/internal/storage/postgresql"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type conversationsStore interface {
	CreateConversationTables() error
	GetConversationsByUser(userID string) ([]postgresql.Conversation, error)
	CreateConversation(c postgresql.Conversation) error
	GetMessages(conversationID string) ([]postgresql.Message, error)
	CreateMessage(m postgresql.Message) error
}

type ConversationHandler struct {
	store conversationsStore
}

func NewConversationHandler(store conversationsStore) *ConversationHandler {
	return &ConversationHandler{store: store}
}

func (h *ConversationHandler) ListConversations(c *gin.Context) {
	userID := c.GetString("userId")
	if userID == "" {
		c.JSON(http.StatusOK, []interface{}{})
		return
	}
	res, err := h.store.GetConversationsByUser(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

func (h *ConversationHandler) CreateConversation(c *gin.Context) {
	var req struct {
		Title string          `json:"title"`
		Meta  json.RawMessage `json:"metadata"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	userID := c.GetString("userId")
	now := time.Now()
	conv := postgresql.Conversation{
		ID:        uuid.NewString(),
		Title:     req.Title,
		UserID:    userID,
		CreatedAt: now,
		UpdatedAt: now,
		Metadata:  req.Meta,
	}
	if err := h.store.CreateConversation(conv); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, conv)
}

func (h *ConversationHandler) ListMessages(c *gin.Context) {
	id := c.Param("id")
	msgs, err := h.store.GetMessages(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, msgs)
}

func (h *ConversationHandler) CreateMessage(c *gin.Context) {
	var req struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	id := c.Param("id")
	now := time.Now()
	msg := postgresql.Message{
		ID:             uuid.NewString(),
		ConversationID: id,
		Role:           req.Role,
		Content:        req.Content,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if err := h.store.CreateMessage(msg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, msg)
}

