package storage

import (
	"sync"
	"time"

	"github.com/WilliamAxelC/Ophanim/pkg/types"
)

// RingBuffer stores a fixed number of the latest log entries in memory.
type RingBuffer struct {
	mu       sync.RWMutex
	capacity int
	entries  []types.LogEntry
	head     int
	count    int
}

// NewRingBuffer creates a ring buffer with the given max capacity.
func NewRingBuffer(capacity int) *RingBuffer {
	if capacity <= 0 {
		capacity = 1000
	}
	return &RingBuffer{
		capacity: capacity,
		entries:  make([]types.LogEntry, capacity),
	}
}

// Push adds a new log entry.
func (rb *RingBuffer) Push(entry types.LogEntry) {
	rb.mu.Lock()
	defer rb.mu.Unlock()

	if entry.Timestamp.IsZero() {
		entry.Timestamp = time.Now()
	}

	rb.entries[rb.head] = entry
	rb.head = (rb.head + 1) % rb.capacity
	if rb.count < rb.capacity {
		rb.count++
	}
}

// GetAll returns all stored log entries in chronological order.
func (rb *RingBuffer) GetAll() []types.LogEntry {
	rb.mu.RLock()
	defer rb.mu.RUnlock()

	result := make([]types.LogEntry, rb.count)
	start := (rb.head - rb.count + rb.capacity) % rb.capacity
	for i := 0; i < rb.count; i++ {
		result[i] = rb.entries[(start+i)%rb.capacity]
	}
	return result
}

// GetTail returns the last n log entries.
func (rb *RingBuffer) GetTail(n int) []types.LogEntry {
	all := rb.GetAll()
	if n >= len(all) || n <= 0 {
		return all
	}
	return all[len(all)-n:]
}
