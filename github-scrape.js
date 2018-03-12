const puppeteer = require('puppeteer');
const mongoose = require('mongoose');
const User = require('./models/user')

//login fields
const USERNAME_SELECTOR = '#login_field';
const PASSWORD_SELECTOR = '#password';
const BUTTON_SELECTOR = '#login > form > div.auth-form-body.mt-3 > input.btn.btn-primary.btn-block';

const LENGTH_SELECTOR_CLASS = 'user-list-item';
const NUM_USERS_SELECTOR = '#js-pjax-container > div > div.columns > div.column.three-fourths.codesearch-results > div > div.d-flex.flex-justify-between.border-bottom.pb-3 > h3';

//personal creds
const CREDS = require('./creds');

let browser, page, pageURL, searchURL;

async function init() {
    browser = await puppeteer.launch({
        headless: false
    });
    page = await browser.newPage();

}

//Login to github
async function login() {

    await page.goto('https://github.com/login');
    await page.click(USERNAME_SELECTOR);
    await page.keyboard.type(CREDS.username);

    await page.click(PASSWORD_SELECTOR);
    await page.keyboard.type(CREDS.password);

    await page.click(BUTTON_SELECTOR);

    await page.waitForNavigation();
}

async function search(query, type) {
    searchURL = `https://github.com/search?utf8=%E2%9C%93&q=${query}&type=${type}`
    await page.goto(searchURL);
    await page.waitFor(2 * 1000);
}

async function getNumPages() {
    let inner = await page.evaluate((sel) => {
        let html = document.querySelector(sel).innerHTML;

        //format is: 69,000 users
        return html.replace(',', '').replace('users', '').trim();
    }, NUM_USERS_SELECTOR);

    let numUsers = parseInt(inner);

    console.log('Number of Users: : ', numUsers);

    //num pages since github shows 10 users per page
    let numPages = Math.ceil(numUsers / 10);
    return numPages;
}

async function getEmailData() {
    let numPages = await getNumPages();
    console.log('Number of Pages: ', numPages);

    for (let p = 1; p <= numPages; p++) {
        //navigate to next page
        pageURL = searchURL + `&p=${p}`;

        await page.goto(pageURL);

        let listLength = await page.evaluate((sel) => {
            return document.getElementsByClassName(sel).length;
        }, LENGTH_SELECTOR_CLASS);


        for (let i = 1; i <= listLength; i++) {

            //email search fields
            let usernameSelector = `#user_search_results > div > div:nth-child(${i}) > div.d-flex > div > a`;
            let emailSelector = `#user_search_results > div > div:nth-child(${i}) > div.d-flex > div > ul > li:nth-child(2) > a`;

            let username = await page.evaluate((sel) => {
                return document.querySelector(sel).getAttribute('href').replace('/', '');
            }, usernameSelector);

            let email = await page.evaluate((sel) => {
                let element = document.querySelector(sel);
                return element ? element.innerHTML : null;
            }, emailSelector);

            if (!email) continue;

            console.log(username, '->', email);
            upsertUser({ username: username, email: email, date: new Date() });
        }

        //check for the max limit reached
        let maxed = await page.evaluate((sel) => {
            let element = document.querySelector(sel);
            if (element != null)
                if (element.innerHTML == "Whoa there!") return true;
        }, 'body > div > h1');

        if(maxed) p = numPages;
    }
}

function upsertUser(userObj) {
    const DB_URL = 'mongodb://localhost/github-scrape/data';
    if (mongoose.connection.readyState == 0) mongoose.connect(DB_URL);

    //if email exists, update entry but dont insert
    let conditions = { email: userObj.email };
    let options = { upsert: true, new: true, setDefaultsOnInsert: true };

    User.findOneAndUpdate(conditions, userObj, options, (err, result) => {
        if (err) throw err;
    });
}

async function main() {
    await init();
    await login(browser, page);
    await search("john", "users");
    await getEmailData();
    browser.close();

    //await page.screenshot({ path: 'screenshots/github.png' });

    //browser.close();
}

main();