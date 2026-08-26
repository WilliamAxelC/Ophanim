package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/WilliamAxelC/Ophanim/pkg/monitor"
)

func main() {
	hubURL := flag.String("hub", os.Getenv("OPHANIM_HUB_URL"), "Ophanim Hub URL (e.g. http://10.20.20.11:8080)")
	token := flag.String("token", os.Getenv("OPHANIM_ENROLL_TOKEN"), "Enrollment or Secret Token")
	nodeID := flag.String("node-id", os.Getenv("OPHANIM_NODE_ID"), "Unique Node Identifier (default: hostname)")
	dockerHost := flag.String("docker", os.Getenv("DOCKER_HOST"), "Docker daemon socket or TCP URL")
	interval := flag.Duration("interval", 2*time.Second, "Telemetry polling interval")
	flag.Parse()

	if *hubURL == "" {
		fmt.Println("Error: Ophanim Hub URL is required (use --hub or set OPHANIM_HUB_URL)")
		flag.Usage()
		os.Exit(1)
	}

	if *nodeID == "" {
		hostname, _ := os.Hostname()
		if hostname == "" {
			hostname = "node-unknown"
		}
		*nodeID = hostname
	}

	if *dockerHost == "" {
		*dockerHost = "unix:///var/run/docker.sock"
	}

	log.Printf("[Ophanim-Monitor] Starting edge agent for node '%s' connecting to %s...", *nodeID, *hubURL)

	agent, err := monitor.NewMonitorAgent(*nodeID, *hubURL, *token, *dockerHost, *interval)
	if err != nil {
		log.Fatalf("Failed to initialize monitor agent: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		log.Println("[Ophanim-Monitor] Shutting down...")
		agent.Stop()
		cancel()
	}()

	if err := agent.Start(ctx); err != nil {
		log.Fatalf("[Ophanim-Monitor] Agent exited with error: %v", err)
	}
}
