package chatops

import (
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/WilliamAxelC/Ophanim/pkg/config"
	"github.com/WilliamAxelC/Ophanim/pkg/storage"
	"github.com/WilliamAxelC/Ophanim/pkg/types"
	"github.com/bwmarrin/discordgo"
)

// DiscordBot manages rich incident alerts, interactive buttons, and slash commands.
type DiscordBot struct {
	config    config.DiscordConfig
	session   *discordgo.Session
	storage   *storage.Storage
	onApprove func(incidentID string) (*types.ActionResponse, error)
}

// NewDiscordBot creates a Discord ChatOps manager.
func NewDiscordBot(cfg config.DiscordConfig, store *storage.Storage, onApprove func(incidentID string) (*types.ActionResponse, error)) *DiscordBot {
	return &DiscordBot{
		config:    cfg,
		storage:   store,
		onApprove: onApprove,
	}
}

// Start opens the Discord websocket connection.
func (b *DiscordBot) Start() error {
	if !b.config.Enabled || b.config.BotToken == "" {
		return nil
	}

	dg, err := discordgo.New("Bot " + b.config.BotToken)
	if err != nil {
		return fmt.Errorf("failed to create discord session: %w", err)
	}

	b.session = dg
	dg.AddHandler(b.handleInteraction)

	if err := dg.Open(); err != nil {
		return fmt.Errorf("failed to open discord connection: %w", err)
	}

	log.Println("[DiscordBot] Connected to Discord ChatOps gateway.")
	return nil
}

// Stop closes the Discord session.
func (b *DiscordBot) Stop() {
	if b.session != nil {
		b.session.Close()
	}
}

// SendIncidentAlert sends a rich embed card with action buttons.
func (b *DiscordBot) SendIncidentAlert(inc *types.Incident) error {
	if b.session == nil || b.config.AlertChannelID == "" {
		return nil
	}

	color := 0x3498db // Blue Info
	switch inc.Severity {
	case types.SeverityCritical:
		color = 0xe74c3c // Red
	case types.SeverityError:
		color = 0xe67e22 // Orange
	case types.SeverityWarning:
		color = 0xf1c40f // Yellow
	}

	fields := []*discordgo.MessageEmbedField{
		{
			Name:   "Status",
			Value:  string(inc.Status),
			Inline: true,
		},
		{
			Name:   "Severity",
			Value:  string(inc.Severity),
			Inline: true,
		},
		{
			Name:   "Impacted Services",
			Value:  strings.Join(inc.ImpactedTargets, ", "),
			Inline: false,
		},
	}

	if inc.RootCauseSummary != "" {
		fields = append(fields, &discordgo.MessageEmbedField{
			Name:   "🤖 Root Cause Analysis (AI SRE)",
			Value:  inc.RootCauseSummary,
			Inline: false,
		})
	}

	embed := &discordgo.MessageEmbed{
		Title:       inc.Title,
		Description: inc.Description,
		Color:       color,
		Fields:      fields,
		Timestamp:   inc.CreatedAt.Format(time.RFC3339),
		Footer: &discordgo.MessageEmbedFooter{
			Text: "Ophanim Homelab SRE • Incident ID: " + inc.ID,
		},
	}

	components := []discordgo.MessageComponent{
		discordgo.ActionsRow{
			Components: []discordgo.MessageComponent{
				discordgo.Button{
					Label:    "Approve Fix",
					Style:    discordgo.SuccessButton,
					CustomID: "approve_" + inc.ID,
					Emoji: &discordgo.ComponentEmoji{
						Name: "🟢",
					},
				},
				discordgo.Button{
					Label:    "View Logs",
					Style:    discordgo.SecondaryButton,
					CustomID: "logs_" + inc.ID,
					Emoji: &discordgo.ComponentEmoji{
						Name: "🔍",
					},
				},
				discordgo.Button{
					Label:    "Ignore",
					Style:    discordgo.DangerButton,
					CustomID: "ignore_" + inc.ID,
					Emoji: &discordgo.ComponentEmoji{
						Name: "❌",
					},
				},
			},
		},
	}

	msg, err := b.session.ChannelMessageSendComplex(b.config.AlertChannelID, &discordgo.MessageSend{
		Embeds:     []*discordgo.MessageEmbed{embed},
		Components: components,
	})
	if err != nil {
		return err
	}

	// Create dedicated Incident Thread
	if inc.Severity == types.SeverityCritical || inc.Severity == types.SeverityError {
		thread, err := b.session.MessageThreadStartComplex(b.config.AlertChannelID, msg.ID, &discordgo.ThreadStart{
			Name:                fmt.Sprintf("Incident %s: %s", inc.ID, inc.Title),
			AutoArchiveDuration: 60,
		})
		if err == nil && thread != nil {
			_, _ = b.session.ChannelMessageSend(thread.ID, "🤖 **Ophanim SRE Agent**: Incident thread opened. Triage in progress...")
		}
	}

	return nil
}

func (b *DiscordBot) handleInteraction(s *discordgo.Session, i *discordgo.InteractionCreate) {
	if i.Type != discordgo.InteractionMessageComponent {
		return
	}

	customID := i.MessageComponentData().CustomID
	if strings.HasPrefix(customID, "approve_") {
		incidentID := strings.TrimPrefix(customID, "approve_")
		if b.onApprove != nil {
			resp, err := b.onApprove(incidentID)
			msg := "Remediation executed successfully!"
			if err != nil {
				msg = fmt.Sprintf("Remediation failed: %v", err)
			} else if resp != nil && resp.Output != "" {
				msg = resp.Output
			}

			_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
				Type: discordgo.InteractionResponseChannelMessageWithSource,
				Data: &discordgo.InteractionResponseData{
					Content: fmt.Sprintf("✅ **Action Executed by <@%s>**:\n```\n%s\n```", i.Member.User.ID, msg),
				},
			})
		}
	} else if strings.HasPrefix(customID, "logs_") {
		incidentID := strings.TrimPrefix(customID, "logs_")
		inc, _ := b.storage.GetIncident(incidentID)
		logsText := "No recent logs captured."
		if inc != nil && len(inc.ImpactedTargets) > 0 {
			target := inc.ImpactedTargets[0]
			logs := b.storage.GetLogTail(target, "", 50)
			if len(logs) > 0 {
				var sb strings.Builder
				for _, l := range logs {
					sb.WriteString(fmt.Sprintf("[%s] %s\n", l.Timestamp.Format("15:04:05"), l.Message))
				}
				logsText = sb.String()
			}
		}

		if len(logsText) > 1900 {
			logsText = logsText[len(logsText)-1900:]
		}

		_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
			Type: discordgo.InteractionResponseChannelMessageWithSource,
			Data: &discordgo.InteractionResponseData{
				Content: fmt.Sprintf("📋 **Recent Logs for %s**:\n```\n%s\n```", incidentID, logsText),
				Flags:   discordgo.MessageFlagsEphemeral,
			},
		})
	}
}
