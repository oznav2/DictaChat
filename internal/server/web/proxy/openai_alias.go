package proxy

import (
	"context"
	"io"
	"net/http"

	"github.com/bricks-cloud/bricksllm/internal/telemetry"
	"github.com/bricks-cloud/bricksllm/internal/util"
	"github.com/gin-gonic/gin"
)

func getChatCompletionAliasHandler(prod, private bool, client http.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		log := util.GetLogFromCtx(c)
		telemetry.Incr("bricksllm.proxy.get_chat_completion_alias_handler.requests", nil, 1)

		if c == nil || c.Request == nil {
			JSON(c, http.StatusInternalServerError, "[BricksLLM] context is empty")
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), c.GetDuration("requestTimeout"))
		defer cancel()

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.openai.com/v1/chat/completions", c.Request.Body)
		if err != nil {
			logError(log, "error when creating openai alias http request", prod, err)
			JSON(c, http.StatusInternalServerError, "[BricksLLM] failed to create openai alias http request")
			return
		}

		copyHttpHeaders(c.Request, req, c.GetBool("removeUserAgent"))
		isStreaming := c.GetBool("stream")
		if isStreaming {
			req.Header.Set("Accept", "text/event-stream")
			req.Header.Set("Cache-Control", "no-cache")
			req.Header.Set("Connection", "keep-alive")
		}

		res, err := client.Do(req)
		if err != nil {
			logError(log, "error when sending http request to openai via alias", prod, err)
			JSON(c, http.StatusInternalServerError, "[BricksLLM] failed to send http request to openai via alias")
			return
		}
		defer res.Body.Close()

		for name, values := range res.Header {
			for _, value := range values {
				c.Header(name, value)
			}
		}

		if ct := res.Header.Get("Content-Type"); len(ct) != 0 {
			c.Writer.Header().Set("Content-Type", ct)
		}
		c.Status(res.StatusCode)
		_, _ = io.Copy(c.Writer, res.Body)
	}
}
