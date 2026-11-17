const tutorVoices = {
    nyx:    {uk: 'bf_isabella', us: 'af_nicole', speed: 0.92},
    roxy:   {uk: 'bf_lily',     us: 'af_bella',  speed: 1.03},
    selene: {uk: 'bf_alice',    us: 'af_kore',   speed: 0.96},
    ivy:    {uk: 'bf_emma',     us: 'af_heart',  speed: 0.97}
};

// Each pair is one performance. The break between beats leaves room for a response.
const TUTOR_LINES = {
    nyx: {
        greeting: ['Oh, there you are. Pull up a chair.', 'Give me one word, and we’ll start there.'],
        correct: ['Mm, yes. That’s the word.', 'Close your eyes for a second. Can you still say it?'],
        personal: ['Good boy. That’s the word.', 'Once more, softly. I’ll wait.'],
        retry: ['Come back to the word with me.', 'Say it once while you can see it. Now once from memory.'],
        readingPerfect: ['Every answer, even the tricky ones.', 'Stay with your favourite sentence a moment. How would you read it aloud?'],
        readingReview: ['Pick one that slipped past you. Just one.', 'I’ll wait while you find the words that give it away.'],
        deckDone: ['That was the last card.', 'Close the deck for a moment. Which word is still on the tip of your tongue?']
    },
    roxy: {
        greeting: ['Oh, you’re taking the seat next to me?', 'All right, then. I get to pick the first word.'],
        correct: ['You got it. Now for the fun bit.', 'Use that word to tell me something I wouldn’t guess about you.'],
        personal: ['Well, look at you. Good boy.', 'Bet you can sneak that word into a real conversation.'],
        retry: ['Oh, that was a tempting answer.', 'Try the right word out loud. Hear the difference?'],
        readingPerfect: ['You caught every single one.', 'Which question almost talked you out of the right answer?'],
        readingReview: ['I’ve got a little dare for you.', 'Find one tiny word in the passage that rules out a wrong answer.'],
        deckDone: ['Out of cards already?', 'Pick the weirdest word in the batch. That’s the one I want to hear tomorrow.']
    },
    selene: {
        greeting: ['Eyes here for a moment.', 'Listen to the word. Leave a beat. Then say it back to me.'],
        correct: ['Exactly. Hold on to that word.', 'Say it again at the pace you’d use in conversation.'],
        personal: ['Good boy. You earned that.', 'Now say the word again. Let me hear the stress.'],
        retry: ['Pause. Look at the answer.', 'Say it slowly once. Then lift your eyes and say it again.'],
        readingPerfect: ['Every answer is correct.', 'Choose the closest pair of answers. Tell me exactly why one fails.'],
        readingReview: ['Choose one answer to revisit.', 'Read the evidence aloud. Stop on the word that changes the meaning.'],
        deckDone: ['That’s the deck finished.', 'Before you go, give me one word from memory. Take your time.']
    },
    ivy: {
        greeting: ['I saved you the quiet seat.', 'Tea first, or shall we try a word while it cools?'],
        correct: ['Oh, that one suits you.', 'Where could you use it today? I’m listening.'],
        personal: ['Good boy. That made me smile.', 'Say it once more, as if we were chatting over coffee.'],
        retry: ['We’ve got time, love.', 'Listen to the word on its own. Then try it with me.'],
        readingPerfect: ['All of them. That deserves a fresh cup.', 'Which bit of the passage would you tell a friend about?'],
        readingReview: ['Stay for one more minute?', 'Let’s put your answer beside the sentence in the passage and see where they part ways.'],
        deckDone: ['There goes the last card.', 'If you could keep just one of those words for a rainy afternoon, which would it be?']
    }
};
