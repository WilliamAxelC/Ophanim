package chatops

import (
	"fmt"
	"log"
	"strings"

	"github.com/WilliamAxelC/Ophanim/pkg/config"
	"github.com/WilliamAxelC/Ophanim/pkg/storage"
	"github.com/WilliamAxelC/Ophanim/pkg/types"
	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
)

// TelegramBot manages Telegram ChatOps alerts and inline approval keyboards.
type TelegramBot struct {
	config    config.TelegramConfig
	bot       *tgbotapi.BotAPI
	storage   *storage.Storage
	onApprove func(incidentID string) (*types.ActionResponse, error)
	stopChan  chan struct{}
}

// NewTelegramBot creates a Telegram bot manager.
func NewTelegramBot(cfg config.TelegramConfig, store *storage.Storage, onApprove func(incidentID string) (*types.ActionResponse, error)) *TelegramBot {
	return &TelegramBot{
		config:    cfg,
		storage:   store,
		onApprove: onApprove,
		stopChan:  make(chan struct{}),
	}
}

// Start connects to Telegram and begins processing updates.
func (t *TelegramBot) Start() error {
	if !t.config.Enabled || t.config.BotToken == "" {
		return nil
	}

	bot, err := tgbotapi.NewBotAPI(t.config.BotToken)
	if err != nil {
		return fmt.Errorf("failed to create telegram bot: %w", err)
	}

	t.bot = bot
	log.Printf("[TelegramBot] Authorized on account @%s", bot.Self.UserName)

	go t.updateLoop()
	return nil
}

// Stop shuts down update polling.
func (t *TelegramBot) Stop() {
	close(t.stopChan)
}

// SendIncidentAlert sends a Markdown formatted alert with inline buttons to the configured chat.
func (t *TelegramBot) SendIncidentAlert(inc *types.Incident) error {
	if t.bot == nil || t.config.ChatID == 0 {
		return nil
	}

	icon := "ℹ️"
	switch inc.Severity {
	case types.SeverityCritical:
		icon = "🚨"
	case types.SeverityError:
		icon = "⚠️"
	case types.SeverityWarning:
		icon = "🟡"
	}

	text := fmt.Sprintf("%s *[%s] %s*\n\n*Description:* %s\n*Impacted:* `%s`\n",
		icon, inc.Severity, inc.Title, inc.Description, strings.Join(inc.ImpactedTargets, ", "))

	if inc.RootCauseSummary != "" {
		text += fmt.Sprintf("\n🤖 *Root Cause Analysis:*\n%s\n", inc.RootCauseSummary)
	}

	keyboard := tgbotapi.NewInlineKeyboardMarkup(
		tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData("🟢 Approve Fix", "approve_"+inc.ID),
			tgbotapi.NewInlineKeyboardButtonData("🔍 View Logs", "logs_"+inc.ID),
		),
	)

	msg := tgbotapi.NewMessage(t.config.ChatID, text)
	msg.ParseMode = "Markdown"
	msg.ReplyMarkup = keyboard

	_, err := t.bot.Send(msg)
	return err
}

func (t *TelegramBot) updateLoop() {
	u := tgbotapi.NewUpdate(0)
	u.Timeout = 60

	updates := t.bot.GetUpdatesChan(u)
	for {
		select {
		case <-t.stopChan:
			return
		case update := <-updates:
			if update.CallbackQuery != nil {
				data := update.CallbackQuery.Data
				if strings.HasPrefix(data, "approve_") {
					incidentID := strings.TrimPrefix(data, "approve_")
					if t.onApprove != nil {
						resp, err := t.onApprove(incidentID)
						replyText := "✅ Action Executed Successfully"
						if err != nil {
							replyText = fmt.Sprintf("❌ Action Failed: %v", err)
						} else if resp != nil && resp.Output != "" {
							replyText = "✅ " + resp.Output
						}

						callback := tgbotapi.NewCallback(update.CallbackQuery.ID, replyText)
						_, _ = t.bot.Request(callback)

						replyMsg := tgbotapi.NewMessage(update.CallbackQuery.Message.Chat.ID, replyText)
						_, _ = t.bot.Send(replyMsg)
					}
				}
			}
		}
	}
}
