const fs = require('fs');
const path = require('path');

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            processDir(fullPath);
        } else if (fullPath.endsWith('.html')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;

            // Check if there is already an absolute path
            if (content.includes('href="/styles.css"')) {
                continue;
            }

            // Replace relative styles.css with absolute
            const regexRelative = /<link\s+rel="stylesheet"\s+href="[^"]*styles\.css"\s*\/?>/g;
            if (regexRelative.test(content)) {
                content = content.replace(regexRelative, '<link rel="stylesheet" href="/styles.css" />');
                modified = true;
            } else {
                // Not found at all. Insert it before the first <link rel="stylesheet" href="...css" />
                // or right before <!-- Theme Initialization Script -->
                const themeScriptIndex = content.indexOf('<!-- Theme Initialization Script -->');
                if (themeScriptIndex !== -1) {
                    content = content.slice(0, themeScriptIndex) + '<link rel="stylesheet" href="/styles.css" />\n    ' + content.slice(themeScriptIndex);
                    modified = true;
                } else {
                    const headEndIndex = content.indexOf('</head>');
                    if (headEndIndex !== -1) {
                        content = content.slice(0, headEndIndex) + '    <link rel="stylesheet" href="/styles.css" />\n' + content.slice(headEndIndex);
                        modified = true;
                    }
                }
            }

            if (modified) {
                fs.writeFileSync(fullPath, content);
                console.log('Fixed', fullPath);
            }
        }
    }
}

processDir(path.join(__dirname, '../pages/ai-features'));
processDir(path.join(__dirname, '../Playground'));
console.log('Done');
