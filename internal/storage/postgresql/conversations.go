package postgresql

import (
	"database/sql"
	"encoding/json"
	"time"
)

type Conversation struct {
	ID        string          `json:"id"`
	Title     string          `json:"title"`
	UserID    string          `json:"user_id"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
	Metadata  json.RawMessage `json:"metadata"`
}

type Message struct {
	ID             string    `json:"id"`
	ConversationID string    `json:"conversation_id"`
	Role           string    `json:"role"`
	Content        string    `json:"content"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func (s *Store) CreateConversationTables() error {
	query := `
		CREATE TABLE IF NOT EXISTS conversations (
			id VARCHAR(255) PRIMARY KEY,
			title VARCHAR(500) NOT NULL DEFAULT 'New Conversation',
			user_id VARCHAR(255) NOT NULL,
			created_at TIMESTAMP NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
			metadata JSONB DEFAULT '{}'::jsonb
		);
		CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);

		CREATE TABLE IF NOT EXISTS messages (
			id VARCHAR(255) PRIMARY KEY,
			conversation_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
			role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
			content TEXT NOT NULL,
			created_at TIMESTAMP NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMP NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
	`

	_, err := s.db.Exec(query)
	return err
}

func (s *Store) GetConversationsByUser(userID string) ([]Conversation, error) {
	rows, err := s.db.Query(`SELECT id, title, user_id, created_at, updated_at, metadata FROM conversations WHERE user_id=$1 ORDER BY updated_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var res []Conversation
	for rows.Next() {
		var c Conversation
		var meta sql.NullString
		if err := rows.Scan(&c.ID, &c.Title, &c.UserID, &c.CreatedAt, &c.UpdatedAt, &meta); err != nil {
			return nil, err
		}
		if meta.Valid {
			c.Metadata = json.RawMessage(meta.String)
		}
		res = append(res, c)
	}
	return res, rows.Err()
}

func (s *Store) CreateConversation(c Conversation) error {
	_, err := s.db.Exec(`INSERT INTO conversations (id, title, user_id, created_at, updated_at, metadata) VALUES ($1, $2, $3, $4, $5, $6)`,
		c.ID, c.Title, c.UserID, c.CreatedAt, c.UpdatedAt, c.Metadata)
	return err
}

func (s *Store) GetMessages(conversationID string) ([]Message, error) {
	rows, err := s.db.Query(`SELECT id, conversation_id, role, content, created_at, updated_at FROM messages WHERE conversation_id=$1 ORDER BY created_at ASC`, conversationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var res []Message
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.Role, &m.Content, &m.CreatedAt, &m.UpdatedAt); err != nil {
			return nil, err
		}
		res = append(res, m)
	}
	return res, rows.Err()
}

func (s *Store) CreateMessage(m Message) error {
	_, err := s.db.Exec(`INSERT INTO messages (id, conversation_id, role, content, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
		m.ID, m.ConversationID, m.Role, m.Content, m.CreatedAt, m.UpdatedAt)
	return err
}

