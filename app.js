const app = document.querySelector('#app');
const seriesName = document.querySelector('#series-name');
const params = new URLSearchParams(location.search);
const seriesId = params.get('series') || 'demo-basics';
const storageKey = `case-history-trainer:series:${seriesId}`;
let series, language, uiLabels = {},
    currentCaseIndex = 0,
    remainingSeconds = 0,
    timerId = null;
let askedQuestionIds = new Set(),
    chosenDiagnoses = new Set(),
    caseResults = [];

const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
} [c]));
const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const currentCase = () => series.cases[currentCaseIndex];
const timeLimitFor = (caseData) => caseData.timeLimitSeconds ?? series.defaultTimeLimitSeconds ?? 300;
const totalScore = () => caseResults.reduce((total, result) => total + result.score, 0);

/** Returns a UI label from i18n/<language>.json. Use {name} placeholders for dynamic values. */
function t(key, variables = {}) {
    const text = uiLabels[key] || key;
    return text.replace(/\{(\w+)\}/g, (_, name) => variables[name] ?? `{${name}}`);
}

function seriesText(field, fallback) {
    return series.labels?.[language]?.[field] ?? series[field] ?? fallback;
}

function caseText(caseData, field) {
    return caseData.labels?.[language]?.[field] ?? caseData[field];
}

function questionText(caseData, question, field) {
    return caseData.labels?.[language]?.questions?.[question.id]?.[field] ?? question[field];
}

function diagnosisText(diagnosis) {
    return series.labels?.[language]?.diagnoses?.[diagnosis] ?? diagnosis;
}

function readPriorResult() {
    try {
        return JSON.parse(localStorage.getItem(storageKey));
    } catch {
        return null;
    }
}

function saveCompletionReminder(score) {
    try {
        localStorage.setItem(storageKey, JSON.stringify({
            score,
            completedAt: new Date().toISOString()
        }));
    } catch {
        /* Storage can be disabled. */ }
}

function validateSeries(data) {
    if (!data || !Array.isArray(data.cases) || !Array.isArray(data.diagnosisPool)) throw new Error(t('errorInvalidSeries'));
    const caseIds = new Set();
    for (const caseData of data.cases) {
        if (!caseData.id || caseIds.has(caseData.id) || !Array.isArray(caseData.questions) || !Array.isArray(caseData.diagnoses?.correct)) throw new Error(t('errorInvalidCase'));
        caseIds.add(caseData.id);
        const questionIds = new Set();
        for (const question of caseData.questions) {
            if (!question.id || questionIds.has(question.id)) throw new Error(t('errorQuestionIds', {
                caseId: caseData.id
            }));
            questionIds.add(question.id);
        }
        const allowed = new Set(data.diagnosisPool);
        (caseData.diagnoses.include || []).forEach((diagnosis) => allowed.add(diagnosis));
        (caseData.diagnoses.exclude || []).forEach((diagnosis) => allowed.delete(diagnosis));
        if (!caseData.diagnoses.correct.length || caseData.diagnoses.correct.some((diagnosis) => !allowed.has(diagnosis))) throw new Error(t('errorDiagnosisPool', {
            caseId: caseData.id
        }));
    }
}

function visibleQuestions(caseData) {
    return caseData.questions.filter((question) => !question.required || question.required.every((id) => askedQuestionIds.has(id)));
}

function groupedQuestions(questions) {
    return questions.reduce((groups, question) => {
        const category = question.category || t('other');
        (groups[category] ||= []).push(question);
        return groups;
    }, {});
}

function caseDiagnoses(caseData) {
    const allowed = new Set(series.diagnosisPool);
    (caseData.diagnoses.include || []).forEach((d) => allowed.add(d));
    (caseData.diagnoses.exclude || []).forEach((d) => allowed.delete(d));
    return [...allowed].sort((a, b) => diagnosisText(a).localeCompare(diagnosisText(b), language));
}

function renderStart() {
    const prior = readPriorResult();
    app.innerHTML = `<section class="card intro">
	<p class="eyebrow">${escapeHtml(seriesText('subject', t('defaultSubject')))}</p>
	<h1>${escapeHtml(seriesText('title', ''))}</h1>
	<p>${escapeHtml(seriesText('description', t('defaultDescription')))}</p>
	<div class="meta">
		<span class="pill">${t('caseCount', { count: series.cases.length })}</span>
		<span class="pill">${t('timedExercise')}</span><span class="pill">${t('noAccount')}</span>
	</div>${prior ? `<div class="callout">${t('priorScore', { score: prior.score })}</div>` : ''}
	<button id="start">${t('startSeries')}</button>
	</section>`;
    document.querySelector('#start').addEventListener('click', () => {
        currentCaseIndex = 0;
        caseResults = [];
        startCase();
    });
}

function startCase() {
    clearInterval(timerId);
    askedQuestionIds = new Set();
    chosenDiagnoses = new Set();
    remainingSeconds = timeLimitFor(currentCase());
    renderCase();
    timerId = setInterval(() => {
        remainingSeconds -= 1;
        if (remainingSeconds <= 0) {
            remainingSeconds = 0;
            submitDiagnosis(true);
        } else renderTimer();
    }, 1000);
}

function renderTimer() {
    const timer = document.querySelector('#timer');
    if (timer) {
        timer.textContent = formatTime(remainingSeconds);
        timer.classList.toggle('safe', remainingSeconds > 60);
    }
}

function renderCase() {
    const caseData = currentCase(); //<h2>${escapeHtml(series.labels?.[language]?.categoryPrompts?.[category] ?? series.categoryPrompts?.[category] ?? t('askAbout'))}</h2>
    const questionMarkup = Object.entries(groupedQuestions(visibleQuestions(caseData))).map(([category, questions]) => `<section class="question-group"><div class="category">${escapeHtml(category)}</div>${questions.map((question) => `<button class="question" type="button" data-question-id="${escapeHtml(question.id)}" ${askedQuestionIds.has(question.id) ? 'disabled' : ''}><span><strong>${escapeHtml(questionText(caseData, question, 'text'))}</strong>${askedQuestionIds.has(question.id) && questionText(caseData, question, 'answer') ? `<br><small>${escapeHtml(questionText(caseData, question, 'answer'))}</small>` : ''}</span>${askedQuestionIds.has(question.id) ? `<span class="asked">${t('asked')}</span>` : `<span class="ask">${t('ask')}</span>`}</button>`).join('')}</section>`).join('');
    const diagnoses = caseDiagnoses(caseData).map((diagnosis) => `<label class="diagnosis"><input type="checkbox" name="diagnosis" value="${escapeHtml(diagnosis)}" ${chosenDiagnoses.has(diagnosis) ? 'checked' : ''}><span>${escapeHtml(diagnosisText(diagnosis))}</span></label>`).join('');
    app.innerHTML = `<section class="card"><div class="case-head"><div><p class="eyebrow">${t('caseProgress', { current: currentCaseIndex + 1, total: series.cases.length })}</p><h1>${escapeHtml(caseText(caseData, 'title'))}</h1><p>${escapeHtml(caseText(caseData, 'presentation'))}</p></div><div id="timer" class="timer ${remainingSeconds > 60 ? 'safe' : ''}" aria-label="${t('timeRemaining')}">${formatTime(remainingSeconds)}</div></div><div class="case-layout"><div class="questions-pane">${questionMarkup || `<p>${t('noMoreQuestions')}</p>`}</div><aside class="diagnosis-panel"><p class="eyebrow">${t('yourConclusion')}</p><h2>${t('diagnosis')}</h2><p class="diagnosis-help">${t('diagnosisHelp')}</p><form id="diagnosis-form"><div class="diagnoses">${diagnoses}</div><button type="submit">${t('submitDiagnosis')}</button></form></aside></div></section>`;
    // Asking is one-way: it reveals the answer and can unlock questions requiring this ID.
    document.querySelectorAll('[data-question-id]').forEach((button) => button.addEventListener('click', () => {
        askedQuestionIds.add(button.dataset.questionId);
        renderCase();
    }));
    document.querySelectorAll('input[name="diagnosis"]').forEach((input) => input.addEventListener('change', () => {
        if (input.checked) chosenDiagnoses.add(input.value);
        else chosenDiagnoses.delete(input.value);
    }));
    document.querySelector('#diagnosis-form').addEventListener('submit', (event) => {
        event.preventDefault();
        submitDiagnosis(false);
    });
}

function calculateScore(result) {
    if (!result.correctSelections.length) return 0;
    const timePercent = (result.remainingSeconds / result.timeLimitSeconds) * 100;
    return Math.max(0, Math.round(timePercent * (result.correctSelections.length / (result.wrongSelections.length + result.correctSelections.length))));
}

function submitDiagnosis(timedOut) {
    clearInterval(timerId);
    const caseData = currentCase(),
        correctSet = new Set(caseData.diagnoses.correct),
        selectedDiagnoses = timedOut ? [] : [...chosenDiagnoses];
    // askedQuestionIds is kept per case and is available to calculateScore for future quality rules.
    const result = {
        caseId: caseData.id,
        askedQuestionIds: [...askedQuestionIds],
        selectedDiagnoses,
        correctDiagnoses: [...correctSet],
        correctSelections: selectedDiagnoses.filter((d) => correctSet.has(d)),
        wrongSelections: selectedDiagnoses.filter((d) => !correctSet.has(d)),
        remainingSeconds,
        timeLimitSeconds: timeLimitFor(caseData),
        timedOut
    };
    result.score = calculateScore(result);
    result.success = result.correctSelections.length > 0;
    caseResults.push(result);
    renderCaseResult(result);
}

function renderCaseResult(result) {
    const isLastCase = currentCaseIndex + 1 === series.cases.length;
    app.innerHTML = `<section class="card result">
	<p class="eyebrow">${t('caseResult', { current: currentCaseIndex + 1 })}</p>
	<h1 class="${result.success ? 'success' : 'failure'}">${result.timedOut ? t('timeUp') : result.success ? t('correctIdentified') : t('noCorrectSelected')}</h1>
	<div class="score">${result.score}</div>
	<p class="score-label">${t('pointsForCase')}</p>
	<div class="answer-review">
		<strong>${t('correctDiagnoses')}</strong>
		<ul>${result.correctDiagnoses.map((d) => `<li>${escapeHtml(diagnosisText(d))}</li>`).join('')}</ul>
		${result.selectedDiagnoses.length ? `<p>
		<strong>${t('yourSelection')}</strong> 
		${escapeHtml(result.selectedDiagnoses.map(diagnosisText).join(', '))}</p>` : `<p>
		<strong>${t('yourSelection')}</strong> ${t('none')}</p>`}
		</div><div class="actions">
		<button id="continue">${isLastCase ? t('finishSeries') : t('nextCase')}</button></div></section>`;
    document.querySelector('#continue').addEventListener('click', () => {
        currentCaseIndex += 1;
        if (currentCaseIndex < series.cases.length) startCase();
        else finishSeries();
    });
}

function finishSeries() {
    const score = totalScore();
    saveCompletionReminder(score);
    app.innerHTML = `<section class="card result"><p class="eyebrow">${t('seriesComplete')}</p><h1>${t('wellDone')}</h1><div class="score">${score}</div><p class="score-label">${t('totalPoints')}</p><p>${t('completionReminder')}</p><button id="again">${t('tryAgain')}</button></section>`;
    document.querySelector('#again').addEventListener('click', renderStart);
}
async function loadLabels(requestedLanguage) {
    const response = await fetch(`i18n/${encodeURIComponent(requestedLanguage)}.json`);
    if (!response.ok) throw new Error('missing language file');
    uiLabels = await response.json();
    language = requestedLanguage;
}
async function init() {
    try {
        const response = await fetch(`cases/${encodeURIComponent(seriesId)}.json`);
        if (!response.ok) throw new Error('series-not-found');
        series = await response.json();
        const requestedLanguage = params.get('lang') || series.defaultLanguage || 'en';
        try {
            await loadLabels(requestedLanguage);
        } catch {
            await loadLabels('en');
        }
        document.documentElement.lang = language;
        validateSeries(series);
        seriesName.textContent = seriesText('title', '');
        renderStart();
    } catch (error) {
        app.innerHTML = `<section class="card"><h1>Unable to load cases</h1><p class="error">${escapeHtml(error.message === 'series-not-found' ? 'The selected case series was not found.' : error.message)}</p></section>`;
    }
}
init();