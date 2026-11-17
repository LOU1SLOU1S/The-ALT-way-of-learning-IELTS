const byId = id => document.getElementById(id);
const icons = () => window.lucide?.createIcons();
const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
function shuffled(items, random = Math.random) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

let currentAccent = localStorage.getItem('ielts_voice_accent') === 'en-US' ? 'en-US' : 'en-GB';

let currentTutor = 'nyx';
let speechRequest = 0;
let playingClip;
let voiceContext;
let playingBuffer;

function displayTutor(input) {
    const card = input.closest('.tutor-card');
    if (currentTutor !== input.value) stopTutorSpeech();
    currentTutor = input.value;
    const name = card.querySelector('strong').textContent;
    byId('hear-tutor').textContent = 'Hear ' + name;
    byId('tutor-note-name').textContent = name;
    byId('tutor-note-text').textContent = '“' + TUTOR_LINES[currentTutor].greeting.join(' ') + '”';
    byId('current-tutor-photo').src = card.querySelector('img').src;
    const label = 'Change tutor (currently ' + name + ')';
    byId('current-tutor').setAttribute('aria-label', label);
    byId('current-tutor').title = label;
    refreshTutorFeedback();
}

function initTutorPicker() {
    const gallery = document.querySelector('.tutor-gallery');
    const savedTutor = localStorage.getItem('ielts_study_tutor');
    const inputs = Array.from(gallery.querySelectorAll('input'));
    const selected = inputs.find(input => input.value === savedTutor) || inputs[0];
    const praiseOption = byId('personal-praise');
    praiseOption.checked = localStorage.getItem('ielts_personal_praise') === 'true';
    praiseOption.addEventListener('change', () => {
        localStorage.setItem('ielts_personal_praise', String(praiseOption.checked));
        stopTutorSpeech();
        refreshTutorFeedback();
    });
    selected.checked = true;
    displayTutor(selected);
    gallery.addEventListener('change', event => {
        const input = event.target;
        localStorage.setItem('ielts_study_tutor', input.value);
        displayTutor(input);
    });
}

function openTutorPicker() {
    switchTab('dashboard');
    document.querySelector('.tutor-card input:checked').focus();
}

function speakTutorLine(cue) {
    const text = TUTOR_LINES[currentTutor][cue].join(' ');
    return speakText(text, cue === 'greeting' ? 'greeting' : 'coach-' + cue);
}

function setTutorFeedback(panel, result) {
    panel.hidden = !result;
    if (!result) {
        delete panel.dataset.result;
        return;
    }
    panel.dataset.result = result;
    const cue = result === 'correct' && byId('personal-praise').checked ? 'personal' : result;
    if (!panel.firstElementChild) panel.append(byId('tutor-feedback-template').content.cloneNode(true));
    panel.querySelector('.feedback-name').textContent = byId('tutor-note-name').textContent;
    panel.querySelector('.feedback-line').textContent = '“' + TUTOR_LINES[currentTutor][cue].join(' ') + '”';
    panel.querySelector('button').onclick = () => speakTutorLine(cue);
}

function refreshTutorFeedback() {
    document.querySelectorAll('.tutor-feedback[data-result]').forEach(panel => {
        setTutorFeedback(panel, panel.dataset.result);
    });
}

function stopTutorSpeech() {
    speechRequest++;
    window.tutorTTS?.cancel();
    if (playingClip) {
        playingClip.onerror = null;
        playingClip.pause();
        playingClip.removeAttribute('src');
        playingClip.load();
        playingClip = null;
    }
    if (playingBuffer) {
        playingBuffer.onended = null;
        playingBuffer.stop();
        playingBuffer.disconnect();
        playingBuffer = null;
    }
    byId('speech-status').textContent = '';
}

function setAccent(accent) {
    currentAccent = accent;
    stopTutorSpeech();
    localStorage.setItem('ielts_voice_accent', accent);
    updateAccentToggleUI();
    renderVocabList();
    filterVocabList();
    const card = appState.srsReviewQueue[appState.currentSrsIndex];
    if (card) byId('srs-card-ipa').textContent = phonetics(card);
}
function updateAccentToggleUI() {
    byId('btn-accent-gb').setAttribute('aria-pressed', currentAccent === 'en-GB');
    byId('btn-accent-us').setAttribute('aria-pressed', currentAccent === 'en-US');
}
function phonetics(item) {
    if (!item.ipaUS) return item.ipa || '';
    return currentAccent === 'en-US' ? 'US ' + item.ipaUS : 'UK ' + item.ipa;
}
// The catalogue contains the exact text used to render each bundled recording.
async function speakText(text, assignedClip) {
    if (typeof text !== 'string' || !text.trim()) return;
    const spoken = text.replace(/\[\s*_+\s*\]/g, 'blank').trim();
    stopTutorSpeech();
    const request = speechRequest;
    const isCurrent = () => request === speechRequest;
    const status = message => { if (isCurrent()) byId('speech-status').textContent = message; };
    const accent = currentAccent === 'en-US' ? 'us' : 'uk';
    const clip = assignedClip || TUTOR_AUDIO_CLIPS.get(spoken);
    try {
        if (clip) {
            playingClip = new Audio('assets/tutor-audio/' + currentTutor + '/' + accent + '/' + clip + '.mp3');
            playingClip.onerror = () => status('This recording could not be played. Tap Listen to retry.');
            await playingClip.play();
            return;
        }

        // Unlock the audio output during the tap, before the voice engine's first download.
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) throw new Error('Custom pronunciation needs a browser with Web Audio support.');
        voiceContext ||= new AudioContextClass();
        if (voiceContext.state !== 'running') await voiceContext.resume();
        if (!isCurrent()) return;
        const profile = tutorVoices[currentTutor];
        status('Preparing your tutor’s voice…');
        const blob = await window.tutorTTS.synthesize(spoken, {
            voice: profile[accent], speed: profile.speed, onStatus: status, isCurrent
        });
        if (!isCurrent()) return;
        const audio = await voiceContext.decodeAudioData(await blob.arrayBuffer());
        if (!isCurrent()) return;
        const source = voiceContext.createBufferSource();
        source.buffer = audio;
        source.connect(voiceContext.destination);
        source.onended = () => {
            source.disconnect();
            if (playingBuffer === source) playingBuffer = null;
        };
        playingBuffer = source;
        source.start();
        status('');
    } catch (error) {
        if (!isCurrent() || error.name === 'AbortError') return;
        if (clip) status('This recording could not be played. Tap Listen to retry.');
        else status('Custom pronunciation could not start. The first use needs internet access. Tap Listen to retry.');
    }
}
function speakTargetWord() {
    const card = appState.srsReviewQueue[appState.currentSrsIndex];
    if (card) speakText(card.word);
}
function speakExampleSentence() {
    const card = appState.srsReviewQueue[appState.currentSrsIndex];
    if (card?.example) speakText(card.example);
}

function calendarDay(date) {
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
}
function studyDay(now) {
    let start = new Date(localStorage.getItem('ielts_start_date') || '');
    if (!Number.isFinite(start.getTime())) {
        start = now;
        localStorage.setItem('ielts_start_date', now.toISOString());
    }
    const offset = Number(localStorage.getItem('ielts_manual_day_offset')) || 0;
    return Math.max(1, 1 + calendarDay(now) - calendarDay(start) + Math.trunc(offset));
}
function loadDeck(saved, now) {
    const cards = (saved || []).map(w => {
        const original = RAW_VOCABULARY_DB.find(v => v.id === w.id && v.word === w.word);
        return original ? {...w, ...original} : {...w};
    });
    for (const item of RAW_VOCABULARY_DB) {
        if (!cards.some(w => w.id === item.id)) cards.push({...item, repetitions:0, interval:1, easeFactor:2.5, nextReview:now.toISOString()});
    }
    return cards;
}
function dailyStats(saved, now, day) {
    return {...saved, ...(saved?.lastStudyDate === now.toDateString() ? {} : {
        wordsLearnedToday:0, passagesCompletedToday:0, totalStudyMinutesToday:0
    }), activeDay:day, lastStudyDate:now.toDateString()};
}
function initAppProgression() {
    const now = new Date();
    const activeDay = studyDay(now);
    return {
        vocab:loadDeck(JSON.parse(localStorage.getItem('ielts_vocab_deck_v5_3')), now),
        stats:dailyStats(JSON.parse(localStorage.getItem('ielts_user_stats_v5_3')), now, activeDay),
        activeDay, activeTab:'dashboard', passages:RAW_PASSAGES_DB, britishPhrases:RAW_BRITISH_DB, builders:RAW_BUILDERS_DB,
        currentBuilderIndex:(activeDay - 1) % RAW_BUILDERS_DB.length,
        reading:{currentPassageId:null, questions:[], timerInterval:null},
        srsReviewQueue:[], currentSrsIndex:0
    };
}
let appState = initAppProgression();
function saveState() {
    localStorage.setItem('ielts_vocab_deck_v5_3', JSON.stringify(appState.vocab));
    localStorage.setItem('ielts_user_stats_v5_3', JSON.stringify(appState.stats));
}
function getUnlockedVocabulary() {
    return appState.vocab.filter(w => (w.dayUnlocked || 1) <= appState.activeDay);
}
function todays(items) { return items[(appState.activeDay - 1) % items.length]; }
function refreshDay() {
    const now = new Date();
    const day = studyDay(now);
    if (appState.stats.lastStudyDate === now.toDateString() && day === appState.activeDay) return;
    appState.activeDay = day;
    const stored = JSON.parse(localStorage.getItem('ielts_user_stats_v5_3'));
    appState.stats = dailyStats(stored || appState.stats, now, day);
    localStorage.setItem('ielts_user_stats_v5_3', JSON.stringify(appState.stats));
    // Let the learner finish an open exercise across midnight.
    if (appState.activeTab !== 'practice') resetDailyPractice();
    if (appState.activeTab !== 'reading') appState.reading.currentPassageId = null;
    updateDashboardMetrics();
    if (appState.activeTab === 'vocab') { renderVocabList(); filterVocabList(); }
    if (appState.activeTab === 'british') renderBritishPhrases();
    refreshPublisherLessons();
}
function resetDailyPractice() {
    appState.currentBuilderIndex = (appState.activeDay - 1) % appState.builders.length;
    generateDynamicFillBlankQuestions();
    renderSentenceBuilder();
    appState.practiceDay = appState.activeDay;
}
function unlockNextDailyBatch() {
    const offset = Number(localStorage.getItem('ielts_manual_day_offset')) || 0;
    localStorage.setItem('ielts_manual_day_offset', String(offset + 1));
    refreshDay();
}
function scheduleMidnight() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    setTimeout(() => { refreshDay(); scheduleMidnight(); }, midnight - now + 50);
}
function openDailyReading() {
    switchTab('reading');
    if (appState.reading.currentPassageId !== todays(appState.passages).id) loadPassage(todays(appState.passages).id);
}
function switchTab(tabId) {
    refreshDay();
    const old = appState.activeTab;
    if (tabId !== old) stopTutorSpeech();
    if (old === 'reading' && tabId !== old && appState.reading.timerInterval) toggleTimer();
    appState.activeTab = tabId;
    document.querySelectorAll('[data-tab]').forEach(btn => {
        const active = btn.dataset.tab === tabId;
        byId('tab-' + btn.dataset.tab).classList.toggle('hidden', !active);
        if (active) btn.setAttribute('aria-current', 'page');
        else btn.removeAttribute('aria-current');
    });
    if (tabId === 'reading') {
        renderPassageSelector();
        if (!appState.reading.currentPassageId || appState.reading.day !== appState.activeDay) loadPassage(todays(appState.passages).id);
    } else if (tabId === 'vocab') { renderVocabList(); filterVocabList(); }
    else if (tabId === 'british') renderBritishPhrases();
    else if (tabId === 'practice' && appState.practiceDay !== appState.activeDay) resetDailyPractice();
    else if (tabId === 'dashboard') updateDashboardMetrics();
    icons();
}
function wordCount(passage) { return passage.paragraphs.join(' ').trim().split(/\s+/).length; }
function updateDashboardMetrics() {
    const words = getUnlockedVocabulary();
    const due = words.filter(w => new Date(w.nextReview) <= new Date()).length;
    const passage = todays(appState.passages);
    byId('desk-date').textContent = new Date().toLocaleDateString('en-GB', {weekday:'short',day:'numeric',month:'long'});
    byId('desk-day').textContent = 'Day ' + appState.activeDay;
    byId('dash-passage-title').textContent = passage.title;
    byId('dash-passage-intro').textContent = passage.intro;
    byId('dash-passage-size').textContent = wordCount(passage) + ' words · ' + passage.questions.length + ' questions';
    byId('desk-focus-word').textContent = todays(RAW_VOCABULARY_DB.filter(w => w.dayUnlocked <= appState.activeDay)).word;
    byId('desk-vocab').textContent = due ? due + ' of your ' + words.length + ' unlocked cards are ready to review.' : 'You’re up to date. Revisit a few familiar words.';
    byId('desk-progress').textContent = appState.stats.wordsLearnedToday + ' cards reviewed · ' + appState.stats.passagesCompletedToday + ' reading exercises completed';
}
function renderPassageSelector() {
    const sel = byId('reading-passage-select');
    sel.replaceChildren(...appState.passages.map(p => new Option(p.title + ' (' + wordCount(p) + ' words)', p.id)));
    sel.value = appState.reading.currentPassageId || todays(appState.passages).id;
}
function loadPassage(id) {
    stopTutorSpeech();
    clearInterval(appState.reading.timerInterval);
    const p = appState.passages.find(x => x.id === id) || todays(appState.passages);
    const r = appState.reading = {currentPassageId:p.id, day:appState.activeDay, questions:shuffled(p.questions), userAnswers:{}, isSubmitted:false, timerSeconds:1200, timerInterval:null};
    byId('reading-passage-select').value = p.id;
    byId('passage-title').textContent = p.title;
    byId('passage-source-label').textContent = p.source;
    byId('passage-text').innerHTML = p.paragraphs.map((para,i) => '<p><strong>' + String.fromCharCode(65+i) + '.</strong> ' + escapeHtml(para) + '</p>').join('');
    const list = byId('questions-list');
    list.replaceChildren();
    for (const [index,q] of r.questions.entries()) {
        const field = document.createElement('fieldset');
        field.className = 'p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2';
        const legend = document.createElement('legend');
        legend.className = 'px-1 text-sm font-semibold';
        legend.textContent = (index + 1) + '. ' + q.prompt;
        field.append(legend);
        for (const opt of shuffled(q.options)) {
            const label = document.createElement('label');
            label.className = 'flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-200 cursor-pointer';
            const radio = document.createElement('input');
            radio.type = 'radio'; radio.name = q.id; radio.value = opt;
            radio.onchange = () => { r.userAnswers[q.id] = opt; };
            label.append(radio, opt);
            field.append(label);
        }
        list.append(field);
    }
    byId('explanations-panel').classList.add('hidden');
    setTutorFeedback(byId('reading-coach'), null);
    byId('question-score-badge').textContent = 'In progress';
    byId('submit-reading').disabled = false;
    byId('retry-reading').hidden = true;
    byId('timer-toggle-btn').disabled = false;
    updateTimerDisplay();
    toggleTimer();
    setupTextSelectionLookup();
}
function toggleTimer() {
    const r = appState.reading;
    if (r.isSubmitted) return;
    if (r.timerInterval) {
        clearInterval(r.timerInterval);
        r.timerInterval = null;
    } else {
        r.timerInterval = setInterval(() => {
            r.timerSeconds--;
            updateTimerDisplay();
            if (r.timerSeconds === 0) submitReadingTest();
        }, 1000);
    }
    byId('timer-toggle-btn').innerHTML = r.timerInterval ? 'Pause' : 'Resume';
}
function updateTimerDisplay() {
    const t = appState.reading.timerSeconds;
    byId('reading-timer').textContent = String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}
function submitReadingTest() {
    const r = appState.reading;
    if (r.isSubmitted) return;
    refreshDay();
    r.isSubmitted = true;
    clearInterval(r.timerInterval);
    r.timerInterval = null;
    const score = r.questions.filter(q => r.userAnswers[q.id] === q.correct).length;
    byId('question-score-badge').textContent = 'Score ' + score + ' / ' + r.questions.length;
    byId('submit-reading').disabled = true;
    byId('retry-reading').hidden = false;
    byId('timer-toggle-btn').disabled = true;
    byId('timer-toggle-btn').textContent = 'Finished';
    byId('questions-list').querySelectorAll('fieldset').forEach(f => f.disabled = true);
    byId('explanations-content').innerHTML = r.questions.map((q,i) => {
        const answer = r.userAnswers[q.id];
        const correct = answer === q.correct;
        return `<div class="p-3 rounded-lg border ${correct ? 'bg-emerald-50' : 'bg-rose-50'}">
          <strong>Q${i+1} · ${correct ? 'Correct' : answer ? 'Incorrect' : 'Unanswered'}</strong>
          <p>Your answer: ${escapeHtml(answer || '—')} · Correct answer: ${escapeHtml(q.correct)}</p>
          <p>Paragraph ${q.evidenceParagraph}: “${escapeHtml(q.quote)}” ${escapeHtml(q.explanation)}</p></div>`;
    }).join('');
    byId('explanations-panel').classList.remove('hidden');
    setTutorFeedback(byId('reading-coach'), score === r.questions.length ? 'readingPerfect' : 'readingReview');
    appState.stats.passagesCompletedToday++;
    appState.stats.totalStudyMinutesToday += Math.round((1200 - r.timerSeconds) / 60);
    saveState();
    updateDashboardMetrics();
}

const councilLessons = [
    ['A talk about motivation','b2/talk-about-motivation'],
    ['Challenges at work','c1/challenges-work'],
    ['A business interview','b2/business-interview'],
    ['A job interview','c1/job-interview'],
    ['Meeting other students','a1/meeting-other-students']
].map(([title,path]) => ({title, url:'https://learnenglish.britishcouncil.org/free-resources/listening/'+path}));
const bbcSeries = {
    listening: {podcast:'p02pc9tn', path:'6-minute-english'},
    phrases: {podcast:'p02pc9zn', path:'the-english-we-speak'}
};
function episodeUrl(url, series) {
    return typeof url === 'string' &&
        url.startsWith('https://www.bbc.co.uk/learningenglish/english/features/' + series.path) &&
        /\/ep-[\w-]+$/.test(url);
}
function parseEpisodes(xml, series) {
    const feed = new DOMParser().parseFromString(xml, 'application/xml');
    const episodes = [];
    const seen = new Set();
    for (const item of feed.querySelectorAll('item')) {
        const title = item.querySelector('title')?.textContent.trim().replace(/^The English We Speak:\s*/i, '');
        const description = item.querySelector('description')?.textContent || '';
        const links = description.match(/https:\/\/www\.bbc\.co\.uk\/learningenglish\/[\w/-]+\/ep-[\w-]+/gi) || [];
        const url = links.find(link => episodeUrl(link, series));
        const published = Date.parse(item.querySelector('pubDate')?.textContent);
        if (!title || !url || seen.has(url) || !Number.isFinite(published)) continue;
        seen.add(url);
        episodes.push({title,url,published});
        if (episodes.length === 90) break;
    }
    if (!episodes.length) throw new Error('No BBC lessons available');
    return episodes.sort((a,b) => b.published - a.published);
}
function dailyEpisode(episodes, now) {
    const pool = episodes.filter(e => e.published <= now.getTime());
    if (!pool.length) return null;
    const day = calendarDay(now);
    // Feature new publications on release day, then rotate through earlier lessons.
    if (pool.length === 1 || calendarDay(new Date(pool[0].published)) === day) return pool[0];
    return pool[1 + day % (pool.length - 1)];
}
function showLesson(kind, episode, now) {
    if (kind === 'phrases') {
        const phrase = episode?.title || todays(appState.britishPhrases).phrase;
        byId('desk-phrase').textContent = '“' + phrase + '”';
        byId('phrase-lesson-panel').hidden = !episode;
        if (episode) {
            byId('phrase-lesson').textContent = phrase + ' ↗';
            byId('phrase-lesson').href = episode.url;
        }
        return;
    }
    const chosen = episode || councilLessons[calendarDay(now) % councilLessons.length];
    byId('listen-title').textContent = chosen.title;
    byId('listen-title').href = byId('listen-link').href = byId('reading-lesson').href = chosen.url;
    byId('reading-lesson').textContent = (episode ? 'BBC Learning English' : 'British Council') + ' · ' + chosen.title + ' ↗';
    byId('listen-source').textContent = episode ? 'BBC Learning English · 6 Minute English' : 'British Council · LearnEnglish';
}
const feedRequests = new Map();
async function refreshFeed(kind) {
    const now = new Date();
    const day = calendarDay(now);
    const series = bbcSeries[kind];
    const key = 'ielts_' + kind + '_feed';
    let cache;
    try { cache = JSON.parse(localStorage.getItem(key)); } catch {}
    const episodes = Array.isArray(cache?.episodes) ? cache.episodes.filter(e => e && typeof e.title === 'string' && episodeUrl(e.url,series) && Number.isFinite(e.published)) : [];
    showLesson(kind, dailyEpisode(episodes, now), now);
    if ((episodes.length && cache.day === day) || feedRequests.get(kind) === day) return;
    feedRequests.set(kind, day);
    try {
        const res = await fetch('https://podcasts.files.bbci.co.uk/' + series.podcast + '.rss', {credentials:'omit', signal:AbortSignal.timeout(12000)});
        if (!res.ok) throw new Error('BBC feed unavailable');
        const fresh = parseEpisodes(await res.text(), series);
        if (calendarDay(new Date()) !== day) return;
        showLesson(kind, dailyEpisode(fresh, now), now);
        localStorage.setItem(key, JSON.stringify({day,episodes:fresh}));
    } catch {
        // The cached or built-in lesson is already available.
    } finally {
        if (feedRequests.get(kind) === day) feedRequests.delete(kind);
    }
}
function refreshPublisherLessons() {
    for (const kind of Object.keys(bbcSeries)) refreshFeed(kind);
}

function dictionaryUrl(word) {
    return 'https://dictionary.cambridge.org/dictionary/english/' + encodeURIComponent(word.trim().toLowerCase().replace(/\s+/g, '-'));
}
function applyHighlight(color) {
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!byId('passage-text').contains(range.commonAncestorContainer)) return;
    const span = document.createElement('span');
    span.className = `highlight-${color}`;
    span.appendChild(range.extractContents());
    range.insertNode(span);
}

function clearHighlight() {
    const container = document.getElementById('passage-text');
    const highlights = container.querySelectorAll('.highlight-yellow, .highlight-green, .highlight-pink');
    highlights.forEach(h => {
        const parent = h.parentNode;
        while (h.firstChild) parent.insertBefore(h.firstChild, h);
        parent.removeChild(h);
    });
}

let selectedLookupWord = "";
function setupTextSelectionLookup() {
    const passageEl = document.getElementById('passage-text');
    passageEl.onmouseup = function(e) {
        const selection = window.getSelection().toString().trim();
        if (selection.length > 2 && selection.length < 30 && !selection.includes(' ')) {
            selectedLookupWord = selection.toLowerCase().replace(/[^a-z]/g, '');
            showDictPopup(selectedLookupWord, e.clientX, e.clientY);
        }
    };
}

function showDictPopup(word, x, y) {
    const popup = document.getElementById('dict-popup');
    document.getElementById('dict-word').innerText = word;

    const match = appState.vocab.find(v => v.word.toLowerCase() === word);
    if (match) {
        document.getElementById('dict-def').innerText = `${match.pos} • ${match.def}`;
        document.getElementById('dict-colloc').innerText = `Collocations: ${match.collocations.join(', ')}`;
    } else {
        document.getElementById('dict-def').innerText = `“${word}” is not in your vocabulary deck.`;
        document.getElementById('dict-colloc').innerText = `Add your own definition and example.`;
    }

    popup.classList.remove('hidden');
    popup.style.left = Math.max(8, Math.min(window.innerWidth - popup.offsetWidth - 8, x + 10)) + 'px';
    popup.style.top = Math.max(8, Math.min(window.innerHeight - popup.offsetHeight - 8, y + 10)) + 'px';
}

function closeDictPopup() {
    document.getElementById('dict-popup').classList.add('hidden');
}

function addSelectedWordToDeck() {
    closeDictPopup();
    openAddWordModal();
    document.getElementById('new-word').value = selectedLookupWord;
}

// ==========================================
// VOCABULARY REVIEW
// ==========================================
function renderVocabList() {
    const grid = document.getElementById('vocab-card-grid');
    grid.innerHTML = '';

    const unlocked = getUnlockedVocabulary();

    unlocked.forEach(item => {
        const card = document.createElement('div');
        card.className = "bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between space-y-4";

        const collocHtml = item.collocations.map(c => `
            <span class="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded text-[11px] font-medium">${escapeHtml(c)}</span>
        `).join('');

        card.innerHTML = `
            <div class="space-y-2">
                <div class="flex items-start justify-between">
                    <div>
                        <div class="flex items-center space-x-2">
                            <h4 class="font-extrabold text-slate-900 text-lg capitalize">${escapeHtml(item.word)}</h4>
                            <button data-play="word" class="text-slate-400 hover:text-indigo-600 p-0.5" title="Listen">
                                <i data-lucide="volume-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                        <span class="font-mono text-xs text-slate-500">${escapeHtml(phonetics(item))}</span> <a class="text-xs text-indigo-700 underline" href="${dictionaryUrl(item.word)}" target="_blank" rel="noopener">Cambridge audio ↗</a>
                    </div>
                    <span class="px-2 py-0.5 text-[10px] font-bold rounded uppercase ${item.category === 'ACADEMIC' ? 'bg-indigo-100 text-indigo-800' : 'bg-rose-100 text-rose-800'}">${escapeHtml(item.pos)}</span>
                </div>
                <p class="text-xs text-slate-600 font-medium">${escapeHtml(item.def)}</p>
                <div>
                    <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Common collocations</span>
                    <div class="flex flex-wrap gap-1.5 mt-1">${collocHtml}</div>
                </div>
                <div class="p-2.5 bg-slate-50 border border-slate-100 rounded-lg text-xs text-slate-600 italic flex items-center justify-between">
                    <span>"${escapeHtml(item.example)}"</span>
                    <button data-play="example" class="text-slate-400 hover:text-indigo-600 shrink-0 ml-2" title="Listen to sentence">
                        <i data-lucide="volume-2" class="w-3.5 h-3.5"></i>
                    </button>
                </div>
            </div>

            <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span>Day ${escapeHtml(item.dayUnlocked || 1)} Batch • Reps: <strong>${escapeHtml(item.repetitions || 0)}</strong></span>
                <span class="text-indigo-600 font-semibold">Next: ${new Date(item.nextReview).toLocaleDateString()}</span>
            </div>
        `;
        card.querySelectorAll('[data-play]').forEach(btn => { btn.onclick = () => speakText(item[btn.dataset.play]); });
        if (!item.example) card.querySelector('[data-play="example"]').parentElement.hidden = true;
        grid.appendChild(card);
    });
    icons();
}

function filterVocabList() {
    const query = document.getElementById('vocab-search-input').value.toLowerCase();
    const cat = document.getElementById('vocab-filter-category').value;
    const cards = document.getElementById('vocab-card-grid').children;
    const unlocked = getUnlockedVocabulary();

    unlocked.forEach((item, idx) => {
        const matchesQuery = (item.synonyms || '').toLowerCase().includes(query) || item.word.toLowerCase().includes(query) || 
                             item.def.toLowerCase().includes(query) || 
                             item.collocations.some(c => c.toLowerCase().includes(query));
        const matchesCat = cat === 'ALL' || item.category === cat;
        if (cards[idx]) {
            cards[idx].style.display = (matchesQuery && matchesCat) ? 'flex' : 'none';
        }
    });
}

function startSrsReview() {
    refreshDay();
    const unlocked = getUnlockedVocabulary();
    const due = unlocked.filter(w => new Date(w.nextReview) <= new Date());
    const pool = due.length ? due : unlocked;
    const first = (appState.activeDay - 1) % pool.length;
    appState.srsReviewQueue = [...pool.slice(first), ...pool.slice(0,first)].slice(0,15);
    appState.currentSrsIndex = 0;
    switchTab('vocab');
    byId('srs-completion').hidden = true;
    setTutorFeedback(byId('deck-coach'), null);
    document.getElementById('srs-review-card-area').classList.remove('hidden');
    showCurrentSrsCard();
}

function closeSrsReview() {
    stopTutorSpeech();
    document.getElementById('srs-review-card-area').classList.add('hidden');
}

function showCurrentSrsCard() {
    stopTutorSpeech();
    const card = appState.srsReviewQueue[appState.currentSrsIndex];
    if (!card) {
        closeSrsReview();
        const count = appState.srsReviewQueue.length;
        const title = byId('srs-completion-title');
        title.textContent = 'Review complete · ' + count + (count === 1 ? ' card' : ' cards');
        setTutorFeedback(byId('deck-coach'), 'deckDone');
        byId('srs-completion').hidden = false;
        title.focus();
        updateDashboardMetrics();
        return;
    }

    document.getElementById('srs-review-progress').innerText = `Card ${appState.currentSrsIndex + 1} of ${appState.srsReviewQueue.length}`;
    document.getElementById('srs-card-cat').innerText = card.category;
    document.getElementById('srs-card-word').innerText = card.word;
    byId('srs-card-ipa').textContent = phonetics(card);
    byId('srs-dictionary').href = dictionaryUrl(card.word);
    document.getElementById('srs-card-pos').innerText = card.pos;
    document.getElementById('srs-card-def').innerText = card.def;

    const collocArea = document.getElementById('srs-card-collocations');
    collocArea.innerHTML = card.collocations.map(c => `
        <span class="px-2.5 py-1 bg-indigo-900/50 border border-indigo-700/50 rounded-lg text-xs text-indigo-200 font-medium">${escapeHtml(c)}</span>
    `).join('');

    byId('srs-card-example').textContent = card.example ? '“' + card.example + '”' : 'No example saved.';
    document.querySelector('[onclick="speakExampleSentence()"]').hidden = !card.example;
    document.getElementById('srs-card-synonyms').innerText = card.synonyms || "None";
    document.getElementById('srs-card-antonyms').innerText = card.antonyms || "None";

    document.getElementById('srs-card-answer').classList.add('hidden');
    document.getElementById('srs-btn-show').classList.remove('hidden');
    document.getElementById('srs-rating-buttons').classList.add('hidden');
    icons();
}

function revealSrsAnswer() {
    document.getElementById('srs-card-answer').classList.remove('hidden');
    document.getElementById('srs-btn-show').classList.add('hidden');
    document.getElementById('srs-rating-buttons').classList.remove('hidden');
}

function rateSrsCard(quality) {
    const card = appState.srsReviewQueue[appState.currentSrsIndex];
    refreshDay();
    const q = quality + 1;

    let repetitions = card.repetitions || 0;
    let easeFactor = card.easeFactor || 2.5;
    let interval = card.interval || 1;

    if (q >= 3) {
        if (repetitions === 0) interval = 1;
        else if (repetitions === 1) interval = 3;
        else interval = Math.round(interval * easeFactor);
        repetitions++;
    } else {
        repetitions = 0;
        interval = 1;
    }

    easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (easeFactor < 1.3) easeFactor = 1.3;

    card.repetitions = repetitions;
    card.easeFactor = easeFactor;
    card.interval = interval;
    card.nextReview = new Date(Date.now() + interval * 86400000).toISOString();

    appState.stats.wordsLearnedToday += 1;
    saveState();

    appState.currentSrsIndex++;
    showCurrentSrsCard();
}

// ==========================================
// BRITISH PRAGMATICS & ACADEMIC DIALOGUE HUB
// ==========================================
function renderBritishPhrases(filter = 'ALL') {
    document.querySelectorAll('[data-phrase-filter]').forEach(btn => btn.setAttribute('aria-pressed', btn.dataset.phraseFilter === filter));
    const container = document.getElementById('british-cards-container');
    container.innerHTML = '';

    const today = todays(appState.britishPhrases);
    const list = [today, ...appState.britishPhrases.filter(b => b !== today)].filter(b => filter === 'ALL' || b.category === filter);

    list.forEach(b => {
        const isToday = b.id === todays(appState.britishPhrases).id;
        const card = document.createElement('div');
        card.className = `bg-white p-5 rounded-2xl border ${isToday ? 'border-rose-300 ring-2 ring-rose-100 shadow-md' : 'border-slate-200 shadow-sm'} space-y-3`;
        card.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-2">
                    <h4 class="font-bold text-slate-900 text-base">${b.phrase}</h4>
                    <button data-play="phrase" class="text-rose-600 hover:text-rose-700 p-0.5" title="Listen in the selected accent">
                        <i data-lucide="volume-2" class="w-4 h-4"></i>
                    </button>
                </div>
                <div class="flex items-center space-x-1.5">
                    ${isToday ? '<span class="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-600 text-white uppercase">Today’s pick</span>' : ''}
                    <span class="px-2 py-0.5 text-[10px] font-bold rounded uppercase ${b.category === 'ACADEMIC' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}">${b.tone}</span>
                </div>
            </div>
            <p class="text-xs text-slate-600 leading-relaxed">${b.meaning}</p>
            <div class="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-800 flex items-center justify-between">
                <div><strong>Context:</strong> <em>"${b.example}"</em></div>
                <button data-play="example" class="text-slate-400 hover:text-indigo-600 shrink-0 ml-2" title="Listen to dialogue">
                    <i data-lucide="volume-2" class="w-3.5 h-3.5"></i>
                </button>
            </div>
            <p class="text-[11px] text-slate-500"><strong>Usage</strong> ${b.notes}</p>
        `;
        card.querySelectorAll('[data-play]').forEach(btn => { btn.onclick = () => speakText(b[btn.dataset.play]); });
        container.appendChild(card);
    });
    icons();
}

function filterBritishCategory(cat) {
    renderBritishPhrases(cat);
}

// ==========================================
// VOCABULARY QUIZ
// ==========================================
let dailyBlankQuestions = [];
let currentBlankIdx = 0;
function storeQuiz() {
    localStorage.setItem('ielts_quiz_attempt', JSON.stringify({
        day:appState.practiceDay, index:currentBlankIdx,
        questions:dailyBlankQuestions.map(q => ({id:q.id, options:q.options, answer:q.userAnswer}))
    }));
}
function generateDynamicFillBlankQuestions(count = 10, fresh = false) {
    appState.practiceDay = appState.activeDay;
    const unique = new Map();
    for (const w of getUnlockedVocabulary()) {
        if (w.word.trim() && w.def.trim()) unique.set(w.word.toLowerCase(), w);
    }
    const pool = [...unique.values()];
    let saved;
    try { saved = JSON.parse(localStorage.getItem('ielts_quiz_attempt')); } catch {}
    const previous = !fresh && saved?.day === appState.activeDay && Array.isArray(saved.questions) ? saved.questions : [];
    const selected = previous.map(q => pool.find(w => w.id === q.id));
    const resume = selected.length > 0 && selected.every(Boolean);
    dailyBlankQuestions = (resume ? selected : shuffled(pool).slice(0, count)).map((w,index) => {
        const curated = RAW_VOCABULARY_DB.find(v => v.id === w.id && v.word === w.word);
        const distractors = curated?.distractors || shuffled([...new Set(RAW_VOCABULARY_DB.map(v => v.word))].filter(s => s.toLowerCase() !== w.word.toLowerCase())).slice(0,3);
        const old = resume && previous[index];
        const allowed = new Set([w.word, ...distractors]);
        // A custom definition can draw different distractors on a subsequent visit.
        const valid = old && Array.isArray(old.options) && old.options.length === 4 && new Set(old.options).size === 4 &&
            old.options.includes(w.word) && old.options.every(o => allowed.has(o) || (!curated && RAW_VOCABULARY_DB.some(v => v.word === o)));
        const options = valid ? old.options : shuffled([...allowed]);
        const answer = valid && options.includes(old.answer) ? old.answer : null;
        return {id:w.id, word:w.word, correct:w.word, text:curated ? curated.example.replace(w.word,'[ _____ ]') : w.def,
            rawSentence:curated ? curated.example : w.word, custom:!curated, options, userAnswer:answer,
            isCorrect:answer === null ? null : answer === w.word, explanation:curated ? curated.example + ' ' + w.def : w.def};
    });
    currentBlankIdx = resume ? Math.max(0,Math.min(Number(saved.index) || 0,dailyBlankQuestions.length-1)) : 0;
    storeQuiz();
    renderQuizPillNavigation();
    renderFillBlankQuiz();
}
function generateFreshQuizSet() { generateDynamicFillBlankQuestions(10, true); }

function renderQuizPillNavigation() {
    const nav = document.getElementById('quiz-nav-pills');
    nav.innerHTML = dailyBlankQuestions.map((q, idx) => `
        <button onclick="goToBlankQuestion(${idx})" id="pill-q-${idx}" class="w-7 h-7 rounded-lg text-xs font-bold transition-all ${idx === currentBlankIdx ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-300' : (q.userAnswer ? (q.isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800') : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100')}">
            ${idx + 1}
        </button>
    `).join('');

    const correctCount = dailyBlankQuestions.filter(q => q.isCorrect === true).length;
    const answeredCount = dailyBlankQuestions.filter(q => q.userAnswer !== null).length;
    document.getElementById('quiz-score-badge').innerText = `Score: ${correctCount} / ${dailyBlankQuestions.length} (${answeredCount} Answered)`;
}

function goToBlankQuestion(idx) {
    currentBlankIdx = idx;
    storeQuiz();
    renderQuizPillNavigation();
    renderFillBlankQuiz();
}

function prevBlankQuestion() {
    if (currentBlankIdx > 0) {
        goToBlankQuestion(currentBlankIdx - 1);
    }
}

function nextBlankQuestion() {
    if (currentBlankIdx < dailyBlankQuestions.length - 1) {
        goToBlankQuestion(currentBlankIdx + 1);
    }
}

function speakBlankQuestion() {
    if (dailyBlankQuestions.length === 0) return;
    const q = dailyBlankQuestions[currentBlankIdx];
    speakText(q.userAnswer ? q.rawSentence : q.text);
}

function renderFillBlankQuiz() {
    stopTutorSpeech();
    if (dailyBlankQuestions.length === 0) {
        setTutorFeedback(byId('quiz-coach'), null);
        return;
    }
    const q = dailyBlankQuestions[currentBlankIdx];
    document.getElementById('blank-q-num').innerText = currentBlankIdx + 1;
    document.getElementById('blank-q-total').innerText = dailyBlankQuestions.length;
    byId('prev-blank').disabled = currentBlankIdx === 0;
    byId('next-blank').disabled = currentBlankIdx === dailyBlankQuestions.length - 1;
    byId('blank-q-topic').textContent = q.custom ? 'Which word has this definition?' : 'Choose the missing word';
    document.getElementById('blank-q-text').innerHTML = escapeHtml(q.text).replace('[ _____ ]', '<span class="px-3 py-1 bg-white border-2 border-dashed border-indigo-400 text-indigo-700 font-bold rounded-lg">[ _____ ]</span>');

    const optContainer = document.getElementById('blank-options-container');
    optContainer.innerHTML = q.options.map((opt, i) => {
        let btnStyle = "bg-white border-slate-200 hover:border-indigo-500 text-slate-800 hover:bg-indigo-50/50";
        if (q.userAnswer) {
            if (opt.toLowerCase() === q.correct.toLowerCase()) {
                btnStyle = "bg-emerald-50 border-emerald-500 text-emerald-900 font-bold";
            } else if (opt.toLowerCase() === q.userAnswer.toLowerCase() && !q.isCorrect) {
                btnStyle = "bg-rose-50 border-rose-500 text-rose-900 line-through";
            }
        }
        return `
            <button onclick="checkBlankAnswer(dailyBlankQuestions[currentBlankIdx].options[${i}])" ${q.userAnswer ? 'disabled' : ''} class="p-3 text-left rounded-xl border font-medium text-xs transition-all ${btnStyle}">
                ${escapeHtml(opt)}
            </button>
        `;
    }).join('');

    const fb = document.getElementById('blank-feedback');
    if (q.userAnswer) {
        fb.className = `p-4 rounded-xl text-xs space-y-1.5 ${q.isCorrect ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-rose-50 text-rose-900 border border-rose-200'}`;
        fb.innerHTML = `
            <div class="font-bold flex items-center justify-between">
                <span>${q.isCorrect ? '✓ Correct' : '✗ Incorrect Choice'}</span>
                <span>Correct: <strong>${escapeHtml(q.correct)}</strong></span>
            </div>
            <div>${escapeHtml(q.explanation)}</div>
        `;
        fb.classList.remove('hidden');
        setTutorFeedback(byId('quiz-coach'), q.isCorrect ? 'correct' : 'retry');
    } else {
        fb.classList.add('hidden');
        setTutorFeedback(byId('quiz-coach'), null);
    }
}

function checkBlankAnswer(selected) {
    const q = dailyBlankQuestions[currentBlankIdx];
    if (q.userAnswer || !q.options.includes(selected)) return;
    q.userAnswer = selected;
    q.isCorrect = selected === q.correct;
    storeQuiz();

    renderQuizPillNavigation();
    renderFillBlankQuiz();
}

// ==========================================
// SENTENCE BUILDER
// ==========================================
let selectedFragments = [];

function renderBuilderPatternPills() {
    const pillsContainer = document.getElementById('builder-pattern-pills');
    pillsContainer.innerHTML = appState.builders.map((b, idx) => `
        <button onclick="selectBuilderPuzzle(${idx})" class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${idx === appState.currentBuilderIndex ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'}">
            ${idx + 1}. ${b.category}
        </button>
    `).join('');
}

function selectBuilderPuzzle(idx) {
    appState.currentBuilderIndex = idx;
    renderSentenceBuilder();
}

function prevSentenceBuilder() {
    appState.currentBuilderIndex = (appState.currentBuilderIndex - 1 + appState.builders.length) % appState.builders.length;
    renderSentenceBuilder();
}

function nextSentenceBuilder() {
    appState.currentBuilderIndex = (appState.currentBuilderIndex + 1) % appState.builders.length;
    renderSentenceBuilder();
}

function renderSentenceBuilder() {
    selectedFragments = [];
    const bData = appState.builders[appState.currentBuilderIndex];

    document.getElementById('builder-index-label').innerText = `Puzzle ${appState.currentBuilderIndex + 1} of ${appState.builders.length}`;
    document.getElementById('builder-pattern-badge').innerText = bData.category || bData.pattern.split('+')[0].trim();
    renderBuilderPatternPills();

    const bank = document.getElementById('builder-bank-area');
    const drop = document.getElementById('builder-drop-area');
    drop.innerHTML = '<span class="text-slate-400 text-xs italic" id="builder-placeholder">Click tiles below to build the sentence in proper syntax...</span>';

    bank.innerHTML = shuffled(bData.fragments).map((f, i) => `
        <button id="tile-${i}" onclick="selectBuilderTile(this.textContent.trim(), this.id)" class="px-3 py-2 bg-white border border-slate-300 hover:border-indigo-500 rounded-lg text-xs font-medium text-slate-800 shadow-sm transition-all">
            ${f}
        </button>
    `).join('');
    document.getElementById('builder-feedback').classList.add('hidden');
}

function selectBuilderTile(fragment, tileId) {
    const btn = document.getElementById(tileId);
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    btn.classList.add('opacity-40');

    selectedFragments.push({ text: fragment, tileId: tileId });
    updateDropArea();
}

function updateDropArea() {
    const drop = document.getElementById('builder-drop-area');
    if (selectedFragments.length === 0) {
        drop.innerHTML = '<span class="text-slate-400 text-xs italic">Click tiles below to build the sentence in proper syntax...</span>';
        return;
    }
    drop.innerHTML = selectedFragments.map((f, i) => `
        <button onclick="removeBuilderTile(${i})" class="px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded text-xs font-semibold cursor-pointer hover:bg-rose-50 hover:text-rose-700 transition-colors">
            ${f.text} ✕
        </button>
    `).join('');
}

function removeBuilderTile(index) {
    const item = selectedFragments[index];
    const btn = document.getElementById(item.tileId);
    if (btn) {
        btn.disabled = false;
        btn.classList.remove('opacity-40');
    }
    selectedFragments.splice(index, 1);
    updateDropArea();
}

function resetSentenceBuilder() {
    renderSentenceBuilder();
}

function checkSentenceBuilder() {
    const bData = appState.builders[appState.currentBuilderIndex];
    const assembled = selectedFragments.map(f => f.text).join(' ');
    const fb = document.getElementById('builder-feedback');
    const isMatch = assembled.trim() === bData.target.trim();

    fb.className = `p-4 rounded-xl text-xs space-y-1.5 ${isMatch ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-rose-50 text-rose-900 border border-rose-200'}`;
    fb.innerHTML = `
        <div class="font-bold">${isMatch ? '✓ Correct sentence' : '✗ Syntax or Fragment Order Incorrect'}</div>
        <div><strong>Target Order:</strong> "${bData.target}"</div>
        <div class="text-[11px] text-slate-500 mt-1"><strong>Grammar Blueprint:</strong> ${bData.explanation || bData.pattern}</div>
    `;
    fb.classList.remove('hidden');
}

function switchQuizMode(mode) {
    stopTutorSpeech();
    if (mode === 'fill-blank') {
        document.getElementById('quiz-blank-section').classList.remove('hidden');
        document.getElementById('quiz-builder-section').classList.add('hidden');
        document.getElementById('btn-quiz-blank').className = "px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200";
        document.getElementById('btn-quiz-builder').className = "px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100";
        if (dailyBlankQuestions.length === 0) generateDynamicFillBlankQuestions(10);
    } else {
        document.getElementById('quiz-blank-section').classList.add('hidden');
        document.getElementById('quiz-builder-section').classList.remove('hidden');
        document.getElementById('btn-quiz-builder').className = "px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200";
        document.getElementById('btn-quiz-blank').className = "px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100";
        renderSentenceBuilder();
    }
}

// ==========================================
// 6-DIGIT CLOUD SYNC & BACKUP ENGINE
// ==========================================
function getOrCreateSyncKey() {
    let key = localStorage.getItem('ielts_cloud_sync_key');
    if (!key || key.length !== 6) {
        key = generateRandom6DigitKey();
        localStorage.setItem('ielts_cloud_sync_key', key);
    }
    return key;
}

function generateRandom6DigitKey() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let res = '';
    for (let i = 0; i < 6; i++) {
        res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
}

function regenerateSyncKey() {
    const newKey = generateRandom6DigitKey();
    localStorage.setItem('ielts_cloud_sync_key', newKey);
    updateSyncModalUI();
    showSyncFeedback('success', `New 6-character sync key: <strong>${newKey}</strong>. Click 'Push / Backup to Cloud' to register it.`);
}

function openSyncModal() {
    updateSyncModalUI();
    document.getElementById('modal-cloud-sync').classList.remove('hidden');
    document.getElementById('modal-cloud-sync').classList.add('flex');
    icons();
}

function closeSyncModal() {
    document.getElementById('modal-cloud-sync').classList.add('hidden');
    document.getElementById('modal-cloud-sync').classList.remove('flex');
}

function updateSyncModalUI() {
    const key = getOrCreateSyncKey();
    document.getElementById('display-sync-key').innerText = key;
    const currentUrl = window.location.origin + window.location.pathname;
    document.getElementById('input-sync-link').value = `${currentUrl}?sync=${key}`;
}

function showSyncFeedback(type, message) {
    const el = document.getElementById('sync-feedback-msg');
    el.className = `p-3 rounded-lg text-xs ${type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`;
    el.textContent = message.replace(/<\/?strong>/g, '');
    el.classList.remove('hidden');
}

function copySyncKey() {
    const key = getOrCreateSyncKey();
    navigator.clipboard.writeText(key).then(() => {
        const btn = document.getElementById('btn-copy-sync-key');
        btn.innerHTML = '<i data-lucide="check" class="w-4 h-4 text-emerald-600"></i>';
        icons();
        setTimeout(() => {
            btn.innerHTML = '<i data-lucide="copy" class="w-4 h-4"></i>';
            icons();
        }, 2000);
    });
}

function copySyncLink() {
    const input = document.getElementById('input-sync-link');
    input.select();
    navigator.clipboard.writeText(input.value).then(() => {
        const btn = document.getElementById('btn-copy-sync-link');
        btn.innerText = 'Copied!';
        setTimeout(() => { btn.innerText = 'Copy Link'; }, 2000);
    });
}

function uploadToCloud() {
    const key = getOrCreateSyncKey();
    const payload = {
        version: "5.3",
        key: key,
        timestamp: new Date().toISOString(),
        vocab: appState.vocab,
        stats: appState.stats,
        activeDay: appState.activeDay,
        accent: currentAccent,
        tutor: currentTutor
    };

    const btn = document.getElementById('btn-push-cloud');
    const orig = btn.innerHTML;
    btn.innerHTML = '<span>Uploading...</span>';
    btn.disabled = true;

    // Direct Key-Value Sync with public endpoint
    fetch(`https://kvdb.io/6P1GzYx7oWk3q8J9yL2vNp/${key}`, {
        method: 'POST',
        body: JSON.stringify(payload)
    })
    .then(res => {
        if (!res.ok) throw new Error('Cloud response error');
        showSyncFeedback('success', `✓ Successfully backed up to cloud with Key: <strong>${key}</strong>! Open the app on another device and enter this key to restore.`);
    })
    .catch(err => {
        // Fallback store in local backup
        localStorage.setItem('ielts_cloud_snapshot_' + key, JSON.stringify(payload));
        showSyncFeedback('success', `✓ Snapshot saved! Key: <strong>${key}</strong> (You can also use 'Export Backup .json' below for 100% offline file transfer).`);
    })
    .finally(() => {
        btn.innerHTML = orig;
        btn.disabled = false;
        icons();
    });
}

function downloadFromCloud() {
    const rawKey = document.getElementById('input-restore-key').value.trim().toUpperCase();
    if (!rawKey || !/^[A-Z0-9]{6}$/.test(rawKey)) {
        showSyncFeedback('error', 'Please enter a valid 6-character sync key (e.g. 849201).');
        return;
    }

    const btn = document.getElementById('btn-pull-cloud');
    const orig = btn.innerHTML;
    btn.innerHTML = '<span>Restoring...</span>';
    btn.disabled = true;

    fetch(`https://kvdb.io/6P1GzYx7oWk3q8J9yL2vNp/${rawKey}`)
    .then(res => {
        if (!res.ok) throw new Error('Key not found or cloud unavailable');
        return res.json();
    })
    .then(data => {
        applyRestoredCloudState(data, rawKey);
        showSyncFeedback('success', `✓ Successfully restored progress from Cloud Key: <strong>${rawKey}</strong>!`);
    })
    .catch(err => {
        const localSnap = localStorage.getItem('ielts_cloud_snapshot_' + rawKey);
        if (localSnap) {
            const data = JSON.parse(localSnap);
            applyRestoredCloudState(data, rawKey);
            showSyncFeedback('success', `✓ Restored from local snapshot with Key: <strong>${rawKey}</strong>!`);
        } else {
            showSyncFeedback('error', `Could not find backup for key "${rawKey}". Please ensure you clicked 'Push / Backup' on your primary device first.`);
        }
    })
    .finally(() => {
        btn.innerHTML = orig;
        btn.disabled = false;
        icons();
    });
}

function applyRestoredCloudState(data, keyUsed) {
    if (!Array.isArray(data?.vocab) || !data.stats || !data.vocab.every(w =>
        w && typeof w.word === 'string' && typeof w.def === 'string' && Array.isArray(w.collocations) && w.collocations.every(c => typeof c === 'string')
    )) throw new Error('Invalid vocabulary backup');
    const now = new Date();
    const savedDay = Number(data.activeDay || data.stats.activeDay || 1);
    const last = new Date(data.stats.lastStudyDate || now);
    if (!Number.isSafeInteger(savedDay) || savedDay < 1 || !Number.isFinite(last.getTime())) throw new Error('Invalid backup date');
    const day = savedDay + Math.max(0, calendarDay(now) - calendarDay(last));
    localStorage.setItem('ielts_start_date', now.toISOString());
    localStorage.setItem('ielts_manual_day_offset', String(day - 1));
    appState.activeDay = day;
    appState.stats = dailyStats(data.stats, now, day);
    appState.vocab = loadDeck(data.vocab, now);
    appState.srsReviewQueue = [];
    closeSrsReview();
    if (['en-GB','en-US'].includes(data.accent)) setAccent(data.accent);
    if (Object.hasOwn(tutorVoices, data.tutor)) {
        const input = document.querySelector('input[name="study-tutor"][value="' + data.tutor + '"]');
        input.checked = true;
        localStorage.setItem('ielts_study_tutor', data.tutor);
        displayTutor(input);
    }
    localStorage.setItem('ielts_cloud_sync_key', keyUsed);
    saveState();
    clearInterval(appState.reading.timerInterval);
    appState.reading.currentPassageId = null;
    localStorage.removeItem('ielts_quiz_attempt');
    resetDailyPractice();
    renderVocabList();
    switchTab(appState.activeTab);
}

function exportBackupFile() {
    const snapshot = {
        version: "5.3",
        key: getOrCreateSyncKey(),
        exportDate: new Date().toISOString(),
        vocab: appState.vocab,
        stats: appState.stats,
        activeDay: appState.activeDay,
        accent: currentAccent,
        tutor: currentTutor
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `the_alternative_way_of_learning_ielts_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function handleFileImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const data = JSON.parse(evt.target.result);
            applyRestoredCloudState(data, data.key || getOrCreateSyncKey());
            showSyncFeedback('success', '✓ Backup file imported successfully!');
        } catch (err) {
            showSyncFeedback('error', 'Invalid JSON backup file.');
        }
    };
    reader.readAsText(file);
}

// ==========================================
// CUSTOM WORD MODAL & LOCAL STORAGE CREATION
// ==========================================
function openAddWordModal() {
    document.getElementById('modal-add-word').classList.remove('hidden');
    document.getElementById('modal-add-word').classList.add('flex');
}

function closeAddWordModal() {
    document.getElementById('modal-add-word').classList.add('hidden');
    document.getElementById('modal-add-word').classList.remove('flex');
}

function saveCustomWord(e) {
    e.preventDefault();
    const word = document.getElementById('new-word').value.trim();
    const ipa = document.getElementById('new-ipa').value.trim();
    const pos = document.getElementById('new-pos').value;
    const category = document.getElementById('new-category').value;
    const def = document.getElementById('new-def').value.trim();
    const collocations = document.getElementById('new-collocations').value.split(',').map(s => s.trim()).filter(Boolean);
    const example = document.getElementById('new-example').value.trim();
    const synonyms = document.getElementById('new-synonyms').value.trim();
    const antonyms = document.getElementById('new-antonyms').value.trim();

    const newEntry = {
        id: 'w_' + Date.now(),
        word,
        ipa,
        pos,
        category,
        def,
        collocations: collocations,
        example,
        synonyms,
        antonyms,
        repetitions: 0,
        interval: 1,
        easeFactor: 2.5,
        nextReview: new Date().toISOString(),
        dayUnlocked: 1
    };

    appState.vocab.unshift(newEntry);
    saveState();
    closeAddWordModal();
    renderVocabList();
    updateDashboardMetrics();
    alert(`"${word}" added successfully to your SRS vocabulary deck!`);
}

// Auto sync if URL parameter exists (?sync=XXXXXX)
function checkUrlSyncOnLoad() {
    const urlParams = new URLSearchParams(window.location.search);
    const syncParam = urlParams.get('sync');
    if (syncParam && syncParam.length === 6) {
        document.getElementById('input-restore-key').value = syncParam;
        downloadFromCloud();
    }
}

// Spacebar to flip flashcard
document.addEventListener('keydown', (e) => {
    if (appState.activeTab === 'vocab' && !e.target.closest('input, textarea, select, button, a') && e.code === 'Space' && !document.getElementById('srs-review-card-area').classList.contains('hidden')) {
        const showBtn = document.getElementById('srs-btn-show');
        if (!showBtn.classList.contains('hidden')) {
            e.preventDefault();
            revealSrsAnswer();
        }
    }
});


window.addEventListener('DOMContentLoaded', () => {
    initTutorPicker();
    updateAccentToggleUI();
    updateDashboardMetrics();
    scheduleMidnight();
    refreshPublisherLessons();
    window.addEventListener('focus', refreshDay);
    window.addEventListener('online', refreshPublisherLessons);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDay(); });
    checkUrlSyncOnLoad();
    icons();
});
