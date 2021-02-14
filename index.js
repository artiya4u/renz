const puppeteer = require('puppeteer');
const fs = require('fs');

const fieldMaps = [
  'รายเดือน : (จ่ายก่อนเข้าพัก)',
  'เงินมัดจำ :',
  'จ่ายล่วงหน้า :',
  'ค่าไฟฟ้า :',
  'ค่าน้ำ :',
  'อินเตอร์เน็ต :',
]

const FieldNames = ['cost', 'deposit', 'prepaid', 'electric', 'water', 'internet'];
let csvHeader = 'Name,CostMin,CostMax,Deposit,Prepaid,Electric,Water,Internet,Link,Latitude,Longitude\n';
const maxPage = 5;
const baseUrl = 'https://renthub.in.th';
const lines = ['bts'];

async function crawlFromPage(url, page, browser) {
  let title = decodeURIComponent(url.split('/')[4].trim())
  let fileName = `output/${title}-${new Date().toISOString()}.csv`
  fs.appendFile(fileName, csvHeader, function (err) {
    if (err) return console.log(err);
  });
  for (let pageIndex = 1; pageIndex <= maxPage; pageIndex++) {
    try {
      // go to the target web
      await page.goto(`${url}/${pageIndex}`);

      // evaluate XPath expression of the target selector (it return array of ElementHandle)
      let ul = await page.$x('//*[@id=\'zone_content\']/div/div[1]/ul/li');
      for (let u of ul) {
        let name = await u.$eval('span.name', el => el.textContent);
        let link = await u.$eval('a', el => el.getAttribute('href'));
        let renz = {name: name, link: 'https://renthub.in.th' + link, phones: [], latitude: null, longitude: null}
        const pageDetail = await browser.newPage();
        await pageDetail.goto(renz.link);
        renz.link = pageDetail.url();
        if (pageDetail.url() === 'https://renthub.in.th/advertise') {
          await pageDetail.close();
          continue
        }
        await pageDetail.waitForXPath('//*[@id=\'description_table\']/li');
        let df = await pageDetail.$x('//*[@id=\'description_table\']/li');
        for (let d of df) {
          renz.phones = await pageDetail.$$eval('span.phone', elements => {
            return elements.map(e => e.textContent);
          });
          let field = await d.$eval('span.field', el => el.textContent);
          let indexOf = fieldMaps.indexOf(field);
          if (indexOf >= 0) {
            renz[FieldNames[indexOf]] = await d.$eval('span.value', el => el.textContent);
          }
        }
        try {
          let location = await pageDetail.evaluate(() => {
            let t = dcp(loc, 5);
            return {
              lon: t[0][1],
              lat: t[0][0]
            }
          });
          renz.latitude = location.lat;
          renz.longitude = location.lon;
        } catch (e) {
          console.error(e.message);
        }
        await pageDetail.$x('a.next_page');
        await pageDetail.close();
        console.log(renz);
        let costs = renz.cost.replace(/,/g, '').split(' - ');
        console.log(costs);
        let stationContent = `"${renz.name.replace(/"/g, '\'\'')}","${costs[0]}","${costs[1]}","${renz.deposit}","${renz.prepaid}","${renz.electric}","${renz.water}","${renz.internet}","${renz.link}",${renz.latitude},${renz.longitude}\n`;
        fs.appendFile(fileName, stationContent, function (err) {
          if (err) return console.log(err);
        });
      }
    } catch (e) {
      console.error(e.message);
    }
  }
}

(async () => {
  // set some options (set headless to false so we can see
  // this automated browsing experience)
  const options = {
    args: [
      '--disable-canvas-aa', // Disable antialiasing on 2d canvas
      '--disable-2d-canvas-clip-aa', // Disable antialiasing on 2d canvas clips
      '--disable-gl-drawing-for-tests', // BEST OPTION EVER! Disables GL drawing operations which produce pixel output. With this the GL output will not be correct but tests will run faster.
      '--disable-dev-shm-usage', // ???
      '--no-zygote', // wtf does that mean ?
      '--use-gl=swiftshader', // better cpu usage with --use-gl=desktop rather than --use-gl=swiftshader, still needs more testing.
      '--enable-webgl',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-first-run',
      '--disable-infobars',
      '--disable-breakpad',
      //'--ignore-gpu-blacklist',
      '--window-size=1280,1024', // see defaultViewport
      '--user-data-dir=./chromeData', // created in index.js, guess cache folder ends up inside too.
      '--no-sandbox', // meh but better resource comsuption
      '--disable-setuid-sandbox' // same
    ],
    headless: true,
    // ignoreDefaultArgs: true, // needed ?
    devtools: false,
  }

  const browser = await puppeteer.launch(options);
  const page = await browser.newPage();

  // set viewport and user agent (just in case for nice viewing)
  await page.setViewport(
    {
      width: 1280,
      height: 882
    });
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36');
  let myArgs = process.argv.slice(2);
  if (myArgs.length === 0) {
    for (let line of lines) {
      await page.goto(baseUrl);
      // wait for element defined by XPath appear in page
      let stations = await page.$$eval(`div.${line} > i > div > a:nth-child(odd)`, elements => {
        return elements.map(e => e.getAttribute('href'));
      });

      for (let station of stations) {
        let url = `${baseUrl}${station}`;
        await crawlFromPage(url, page, browser)
      }
    }
  } else {
    await crawlFromPage(myArgs[0], page, browser)
  }

  // close the browser
  await browser.close();
})();
