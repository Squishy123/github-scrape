const puppeteer = require('puppeteer');

async function main() {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.goto('https://github.com');
    await page.screenshot({path: 'screenshots/github.png'});

    browser.close();
}

main();