// Style for new elements. Gets appended to the Gradio root.
const autocompleteCSS_dark = `
    #autocompleteResults {
        position: absolute;
        z-index: 999;
        margin: 5px 0 0 0;
        background-color: #0b0f19 !important;
        border: 1px solid #4b5563 !important;
        border-radius: 12px !important;
        overflow: hidden;
    }
    #autocompleteResultsList > li:nth-child(odd) {
        background-color: #111827;
    }
    #autocompleteResultsList > li {
        list-style-type: none;
        padding: 10px;
        cursor: pointer;
    }
    #autocompleteResultsList > li:hover {
        background-color: #1f2937;
    }
`;
const autocompleteCSS_light = `
    #autocompleteResults {
        position: absolute;
        z-index: 999;
        margin: 5px 0 0 0;
        background-color: #ffffff !important;
        border: 1.5px solid #e5e7eb !important;
        border-radius: 12px !important;
        overflow: hidden;
    }
    #autocompleteResultsList > li:nth-child(odd) {
        background-color: #f9fafb;
    }
    #autocompleteResultsList > li {
        list-style-type: none;
        padding: 10px;
        cursor: pointer;
    }
    #autocompleteResultsList > li:hover {
        background-color: #f5f6f8;
    }
`;

var acConfig = null;

// Parse the CSV file into a 2D array. Doesn't use regex, so it is very lightweight.
function parseCSV(str) {
    var arr = [];
    var quote = false;  // 'true' means we're inside a quoted field

    // Iterate over each character, keep track of current row and column (of the returned array)
    for (var row = 0, col = 0, c = 0; c < str.length; c++) {
        var cc = str[c], nc = str[c+1];        // Current character, next character
        arr[row] = arr[row] || [];             // Create a new row if necessary
        arr[row][col] = arr[row][col] || '';   // Create a new column (start with empty string) if necessary

        // If the current character is a quotation mark, and we're inside a
        // quoted field, and the next character is also a quotation mark,
        // add a quotation mark to the current column and skip the next character
        if (cc == '"' && quote && nc == '"') { arr[row][col] += cc; ++c; continue; }

        // If it's just one quotation mark, begin/end quoted field
        if (cc == '"') { quote = !quote; continue; }

        // If it's a comma and we're not in a quoted field, move on to the next column
        if (cc == ',' && !quote) { ++col; continue; }

        // If it's a newline (CRLF) and we're not in a quoted field, skip the next character
        // and move on to the next row and move to column 0 of that new row
        if (cc == '\r' && nc == '\n' && !quote) { ++row; col = 0; ++c; continue; }

        // If it's a newline (LF or CR) and we're not in a quoted field,
        // move on to the next row and move to column 0 of that new row
        if (cc == '\n' && !quote) { ++row; col = 0; continue; }
        if (cc == '\r' && !quote) { ++row; col = 0; continue; }

        // Otherwise, append the current character to the current column
        arr[row][col] += cc;
    }
    return arr;
}

// Load file
function readFile(filePath) {
    let request = new XMLHttpRequest();
    request.open("GET", filePath, false);
    request.send(null);
    return request.responseText;
}

function loadCSV() {
    let text = readFile(`file/tags/${acConfig.tagFile}`);
    return parseCSV(text);
}

// Debounce function to prevent spamming the autocomplete function
var dbTimeOut;
const debounce = (func, wait = 300) => {
    return function(...args) {
        if (dbTimeOut) {
            clearTimeout(dbTimeOut);
        }

        dbTimeOut = setTimeout(() => {
            func.apply(this, args);
        }, wait);
    }
}

// Create the result list div and necessary styling
function createResultsDiv() {
    let resultsDiv = document.createElement("div");
    let resultsList = document.createElement('ul');
    
    resultsDiv.setAttribute('id', 'autocompleteResults');
    resultsList.setAttribute('id', 'autocompleteResultsList');
    resultsDiv.appendChild(resultsList);

    return resultsDiv;
}

// Show or hide the results div
function showResults() {
    let resultsDiv = gradioApp().querySelector('#autocompleteResults');
    resultsDiv.style.display = "block";
}
function hideResults() {
    let resultsDiv = gradioApp().querySelector('#autocompleteResults');
    resultsDiv.style.display = "none";
}

// On click, insert the tag into the prompt textbox with respect to the cursor position
function insertTextAtCursor(text, tagword) {
    let promptTextbox = gradioApp().querySelector('#txt2img_prompt > label > textarea');
    let cursorPos = promptTextbox.selectionStart;
    let sanitizedText = acConfig.replaceUnderscores ? text.replaceAll("_", " ") : text;
    let optionalComma = (promptTextbox.value[cursorPos] == ",") ? "" : ", ";

    // Edit prompt text
    var prompt = promptTextbox.value;
    promptTextbox.value = prompt.substring(0, cursorPos - tagword.length) + sanitizedText + optionalComma + prompt.substring(cursorPos);
    prompt = promptTextbox.value;

    // Update cursor position to after the inserted text
    promptTextbox.selectionStart = cursorPos + sanitizedText.length;
    promptTextbox.selectionEnd = promptTextbox.selectionStart;

    // Hide results after inserting
    hideResults();

    // Update previous tags with the edited prompt to prevent re-searching the same term
    let tags = prompt.match(/[^, ]+/g);
    previousTags = tags;
}

const colors_dark = ["lightblue", "indianred", "unused", "violet", "lightgreen", "orange"];
const colors_light = ["dodgerblue", "firebrick", "unused", "darkorchid", "darkgreen", "darkorange" ]
function addResultsToList(results, tagword) {
    let resultsList = gradioApp().querySelector('#autocompleteResultsList');
    resultsList.innerHTML = "";

    let colors = gradioApp().querySelector('.dark') ? colors_dark : colors_light;

    for (let i = 0; i < results.length; i++) {
        let result = results[i];
        let li = document.createElement("li");
        li.innerHTML = result[0];
        li.style = `color: ${colors[result[1]]};`;
        li.addEventListener("click", function() { insertTextAtCursor(result[0], tagword); });
        resultsList.appendChild(li);
    }
}

allTags = [];
previousTags = [];

function autocomplete(prompt) {
    // Guard for empty prompt
    if (prompt.length == 0) {
        hideResults();
        return;
    }

    // Match tags with RegEx to get the last edited one
    let tags = prompt.match(/[^, ]+/g);
    let difference = tags.filter(x => !previousTags.includes(x));
    previousTags = tags;

    // Guard for no difference / only whitespace remaining
    if (difference == undefined || difference.length == 0) {
        hideResults();
        return;
    }

    let tagword = difference[0]

    // Guard for empty tagword
    if (tagword == undefined || tagword.length == 0) {
        hideResults();
        return;
    }
    
    let results = allTags.filter(x => x[0].includes(tagword)).slice(0, acConfig.maxResults);

    // Guard for empty results
    if (results.length == 0) {
        hideResults();
        return;
    }

    showResults();
    addResultsToList(results, tagword);
}

onUiUpdate(function(){
    // One-time CSV setup
    if (acConfig == null) acConfig = JSON.parse(readFile("file/tags/config.json"));
    if (allTags.length == 0) allTags = loadCSV();

	let promptTextbox = gradioApp().querySelector('#txt2img_prompt > label > textarea');
	
    if (promptTextbox == null) return;
    if (gradioApp().querySelector('#autocompleteResults') != null) return;

    // Only add listeners once
    if (!promptTextbox.classList.contains('autocomplete')) {
        // Add our new element
        var resultsDiv = gradioApp().querySelector('#autocompleteResults') ?? createResultsDiv();
        promptTextbox.parentNode.insertBefore(resultsDiv, promptTextbox.nextSibling);
        // Hide by default so it doesn't show up on page load
        hideResults();
        
        // Add autocomplete event listener
        promptTextbox.addEventListener('input', debounce(() => autocomplete(promptTextbox.value), 100));
        // Add focusout event listener
        promptTextbox.addEventListener('focusout', debounce(() => hideResults(), 400));

        // Add class so we know we've already added the listeners
        promptTextbox.classList.add('autocomplete');

        // Add style to dom
        let acStyle = document.createElement('style');

        let css = gradioApp().querySelector('.dark') ? autocompleteCSS_dark : autocompleteCSS_light;
        if (acStyle.styleSheet) {
            acStyle.styleSheet.cssText = css;
        } else {
            acStyle.appendChild(document.createTextNode(css));
        }
        gradioApp().appendChild(acStyle);
    }
});