import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";

export default function SpacedRepetitionTrainer() {
  const [cards, setCards] = useState(() => {
    const saved = localStorage.getItem("cradle_srs_cards");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved cards", e);
      }
    }
    return [
      {
        id: "1",
        question: "What is Spaced Repetition?",
        answer:
          "A learning technique that incorporates increasing intervals of time between subsequent review of previously learned material.",
        interval: 0,
        repetitions: 0,
        dueDate: Date.now(),
      },
    ];
  });

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [viewMode, setViewMode] = useState("review"); // 'review' | 'manage'
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    localStorage.setItem("cradle_srs_cards", JSON.stringify(cards));
  }, [cards]);

  // Filter cards that are due for review
  const now = Date.now();
  const dueCards = cards.filter(card => card.dueDate <= now);
  const activeCard = dueCards[currentCardIndex] || dueCards[0];

  const handleAddCard = e => {
    e.preventDefault();
    if (!question.trim() || !answer.trim()) return;

    const newCard = {
      id: Date.now().toString(),
      question,
      answer,
      interval: 0,
      repetitions: 0,
      dueDate: Date.now(),
    };

    setCards([...cards, newCard]);
    setQuestion("");
    setAnswer("");
  };

  const handleDeleteCard = id => {
    setCards(cards.filter(c => c.id !== id));
  };

  // Process review rating (1 = Again/Hard, 2 = Good, 3 = Easy)
  const handleRating = rating => {
    if (!activeCard) return;

    let { interval, repetitions } = activeCard;
    let nextIntervalDays = 1;

    if (rating === 1) {
      // Again
      repetitions = 0;
      nextIntervalDays = 0.02; // ~30 minutes or immediately
    } else if (rating === 2) {
      // Good
      repetitions += 1;
      nextIntervalDays = repetitions === 1 ? 1 : interval * 2;
    } else if (rating === 3) {
      // Easy
      repetitions += 1;
      nextIntervalDays = repetitions === 1 ? 3 : interval * 3.5;
    }

    const nextDueDate = Date.now() + nextIntervalDays * 24 * 60 * 60 * 1000;

    const updatedCards = cards.map(c =>
      c.id === activeCard.id
        ? {
            ...c,
            interval: nextIntervalDays,
            repetitions,
            dueDate: nextDueDate,
          }
        : c
    );

    setCards(updatedCards);
    setIsFlipped(false);
    if (currentCardIndex >= dueCards.length - 1) {
      setCurrentCardIndex(0);
    }
  };

  return (
    <div
      style={{
        padding: "2rem",
        maxWidth: "700px",
        margin: "0 auto",
        fontFamily: "sans-serif",
      }}
    >
      <h2>Spaced Repetition Trainer</h2>
      <p style={{ color: "#666" }}>
        Review flashcards based on intelligent scheduling intervals.
      </p>

      {/* Navigation Tabs */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
        <button
          onClick={() => setViewMode("review")}
          style={{
            padding: "0.5rem 1rem",
            background: viewMode === "review" ? "#2563eb" : "#e2e8f0",
            color: viewMode === "review" ? "#fff" : "#000",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Review Due ({dueCards.length})
        </button>
        <button
          onClick={() => setViewMode("manage")}
          style={{
            padding: "0.5rem 1rem",
            background: viewMode === "manage" ? "#2563eb" : "#e2e8f0",
            color: viewMode === "manage" ? "#fff" : "#000",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Add / Manage Cards ({cards.length})
        </button>
      </div>

      {viewMode === "review" ? (
        <div>
          {dueCards.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "3rem",
                background: "#f8fafc",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
              }}
            >
              <h3>🎉 All caught up!</h3>
              <p style={{ color: "#666" }}>
                No flashcards are due for review right now. Check back later or
                add new ones.
              </p>
            </div>
          ) : (
            <div
              style={{
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                padding: "2rem",
                background: "#ffffff",
                minHeight: "220px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: "#64748b",
                    marginBottom: "0.5rem",
                  }}
                >
                  Card {currentCardIndex + 1} of {dueCards.length} due
                </div>
                <h3 style={{ marginTop: 0, fontSize: "1.25rem" }}>
                  {activeCard.question}
                </h3>
                {isFlipped && (
                  <div
                    style={{
                      marginTop: "1.5rem",
                      padding: "1rem",
                      background: "#f1f5f9",
                      borderRadius: "6px",
                      borderLeft: "4px solid #3b82f6",
                    }}
                  >
                    <strong>Answer:</strong> {activeCard.answer}
                  </div>
                )}
              </div>

              <div
                style={{
                  marginTop: "2rem",
                  display: "flex",
                  justifyContent: "center",
                  gap: "1rem",
                }}
              >
                {!isFlipped ? (
                  <button
                    onClick={() => setIsFlipped(true)}
                    style={{
                      padding: "0.75rem 2rem",
                      background: "#2563eb",
                      color: "#fff",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontWeight: "bold",
                    }}
                  >
                    Show Answer
                  </button>
                ) : (
                  <div
                    style={{ display: "flex", gap: "0.75rem", width: "100%" }}
                  >
                    <button
                      onClick={() => handleRating(1)}
                      style={{
                        flex: 1,
                        padding: "0.75rem",
                        background: "#dc2626",
                        color: "#fff",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                      }}
                    >
                      Hard / Again
                    </button>
                    <button
                      onClick={() => handleRating(2)}
                      style={{
                        flex: 1,
                        padding: "0.75rem",
                        background: "#d97706",
                        color: "#fff",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                      }}
                    >
                      Good
                    </button>
                    <button
                      onClick={() => handleRating(3)}
                      style={{
                        flex: 1,
                        padding: "0.75rem",
                        background: "#16a34a",
                        color: "#fff",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                      }}
                    >
                      Easy
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          {/* Add Card Form */}
          <form
            onSubmit={handleAddCard}
            style={{
              background: "#f8fafc",
              padding: "1.5rem",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              marginBottom: "1.5rem",
            }}
          >
            <h3 style={{ marginTop: 0, fontSize: "1.1rem" }}>
              Create New Flashcard
            </h3>
            <div style={{ marginBottom: "1rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  marginBottom: "0.3rem",
                }}
              >
                Question / Prompt
              </label>
              <textarea
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="Enter prompt..."
                rows="2"
                required
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid #cbd5e1",
                }}
              />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  marginBottom: "0.3rem",
                }}
              >
                Answer
              </label>
              <textarea
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                placeholder="Enter answer..."
                rows="2"
                required
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid #cbd5e1",
                }}
              />
            </div>
            <button
              type="submit"
              style={{
                padding: "0.5rem 1.5rem",
                background: "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Add Card
            </button>
          </form>

          {/* Cards List */}
          <h4>Existing Flashcards</h4>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
          >
            {cards.map(card => (
              <div
                key={card.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "1rem",
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                }}
              >
                <div>
                  <div style={{ fontWeight: "bold" }}>{card.question}</div>
                  <div
                    style={{
                      fontSize: "0.85rem",
                      color: "#64748b",
                      marginTop: "0.25rem",
                    }}
                  >
                    Answer: {card.answer}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteCard(card.id)}
                  style={{
                    background: "#fee2e2",
                    color: "#b91c1c",
                    border: "none",
                    padding: "0.4rem 0.8rem",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

SpacedRepetitionTrainer.propTypes = {};
