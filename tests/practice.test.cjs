const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function app() {
    const storage = new Map();
    const context = vm.createContext({
        localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key,value) => storage.set(key,String(value))},
        document: {addEventListener() {}}, window: {addEventListener() {}}
    });
    const run = source => vm.runInContext(source,context);
    for (const file of ['curriculum.js','app.js']) run(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
    return run;
}

test('every reading key occurs once and its evidence appears in the cited paragraph', () => {
    const run = app();
    for (const p of run('RAW_PASSAGES_DB')) {
        assert.equal(new Set(p.questions.map(q => q.id)).size,p.questions.length,p.title);
        for (const q of p.questions) {
            assert.equal(q.options.filter(v => v === q.correct).length,1,q.id);
            assert.equal(new Set(q.options).size,q.options.length,q.id);
            assert.ok(p.paragraphs[q.evidenceParagraph.charCodeAt(0)-65].includes(q.quote),q.id);
            if (q.correct === 'NOT GIVEN') assert.ok(q.explanation,q.id);
        }
    }
});

test('every vocabulary question has one exact gap and four distinct choices', () => {
    const run = app();
    const words = run('RAW_VOCABULARY_DB');
    const known = new Set(words.map(w => w.word));
    for (const w of words) {
        assert.equal(w.example.split(w.word).length,2,w.word);
        assert.equal(new Set([w.word,...w.distractors]).size,4,w.word);
        assert.ok(w.distractors.every(d => known.has(d)),w.word);
        assert.ok([w.ipa,w.ipaUS].every(pr => /^\/[^\\]+\/$/.test(pr)),w.word);
    }
    for (const b of run('RAW_BUILDERS_DB')) assert.equal(b.fragments.join(' '),b.target);
});

test('a shuffle can place the correct option in every position without changing the source', () => {
    const run = app();
    assert.equal(run(`const source = ['key','b','c','d']; const positions = new Set();
        for (let i=0;i<4;i++) for (let j=0;j<3;j++) for (let k=0;k<2;k++) {
            const draws = [(i+.1)/4,(j+.1)/3,(k+.1)/2];
            positions.add(shuffled(source,() => draws.shift()).indexOf('key'));
        }
        positions.size`),4);
    assert.equal(run("source.join(',')"),'key,b,c,d');
});

test('calendar rollover, skipped days and manual offsets use local dates', () => {
    const run = app();
    run(`localStorage.setItem('ielts_start_date',new Date(2026,2,28,23,58).toISOString())`);
    assert.equal(run('studyDay(new Date(2026,2,29,0,1))'),2);
    assert.equal(run('studyDay(new Date(2026,2,30,0,1))'),3);
    run("localStorage.setItem('ielts_manual_day_offset','4')");
    assert.equal(run('studyDay(new Date(2026,3,4))'),12);
    assert.equal(run("dailyStats({lastStudyDate:'Yesterday',wordsLearnedToday:9},new Date(),2).wordsLearnedToday"),0);
});

test('updated pronunciations retain study history and custom words', () => {
    const run = app();
    const [card,custom] = run(`loadDeck([{id:'w1',word:'mitigate',ipa:'/bad/',repetitions:4,nextReview:'2027-01-02'},
        {id:'own',word:'book club',ipa:'',def:'a reading group'}],new Date())`);
    assert.equal(card.repetitions,4);
    assert.equal(card.nextReview,'2027-01-02');
    assert.equal(card.ipa,'/ˈmɪt.ɪ.ɡeɪt/');
    assert.equal(custom.word,'book club');
});

test('daily publisher selection features releases, rotates the archive and skips future items', () => {
    const run = app();
    run(`const releases = [12,7,3,1].map(n => ({title:String(n),published:new Date(2026,5,n,9).getTime()}))`);
    assert.equal(run('dailyEpisode(releases,new Date(2026,5,7,12)).title'),'7');
    assert.notEqual(run('dailyEpisode(releases,new Date(2026,5,8)).title'),run('dailyEpisode(releases,new Date(2026,5,9)).title'));
    assert.equal(run('dailyEpisode(releases,new Date(2026,4,1))'),null);
});

test('speech keeps word boundaries and punctuation and chooses the exact accent first', () => {
    const run = app();
    run(`document.getElementById = () => ({});
        let spoken;
        window.SpeechSynthesisUtterance = globalThis.SpeechSynthesisUtterance = class {constructor(text){ this.text = text; }};
        window.speechSynthesis = {cancel(){},getVoices:()=>[{lang:'en-US'},{lang:'en_GB'}],speak:u=>{spoken=u}};
        speakText("It’s a [ _____ ] day — shall we go?")`);
    assert.equal(run('spoken.text'),'It’s a blank day — shall we go?');
    assert.equal(run('spoken.voice.lang'),'en_GB');
});
