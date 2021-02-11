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


const maxPage = 5;
const baseUrl = 'https://www.renthub.in.th/%E0%B8%AD%E0%B8%9E%E0%B8%B2%E0%B8%A3%E0%B9%8C%E0%B8%97%E0%B9%80%E0%B8%A1%E0%B9%89%E0%B8%99%E0%B8%97%E0%B9%8C-%E0%B8%AB%E0%B9%89%E0%B8%AD%E0%B8%87%E0%B8%9E%E0%B8%B1%E0%B8%81-%E0%B8%AB%E0%B8%AD%E0%B8%9E%E0%B8%B1%E0%B8%81/mrt-%E0%B8%A8%E0%B8%B9%E0%B8%99%E0%B8%A2%E0%B9%8C%E0%B8%A7%E0%B8%B1%E0%B8%92%E0%B8%99%E0%B8%98%E0%B8%A3%E0%B8%A3%E0%B8%A1%E0%B9%81%E0%B8%AB%E0%B9%88%E0%B8%87%E0%B8%9B%E0%B8%A3%E0%B8%B0%E0%B9%80%E0%B8%97%E0%B8%A8%E0%B9%84%E0%B8%97%E0%B8%A2';

(async () => {
  // set some options (set headless to false so we can see
  // this automated browsing experience)
  let launchOptions = {headless: true, args: ['--start-maximized']};

  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();

  // set viewport and user agent (just in case for nice viewing)
  await page.setViewport({width: 1920, height: 1080});
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36');

  let allRenz = [];
  let csvContent = "Name,Cost,Deposit,Prepaid,Electric,Water,Internet,Link,Latitude,Longitude\n";
  for (let i = 1; i <= maxPage; i++) {
    try {
      // go to the target web
      await page.goto(`${baseUrl}/${i}`);

      // wait for element defined by XPath appear in page
      await page.waitForXPath("//*[@id=\"zone_content\"]/div/div[1]/ul/li");

      // evaluate XPath expression of the target selector (it return array of ElementHandle)
      let ul = await page.$x("//*[@id=\"zone_content\"]/div/div[1]/ul/li");
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
        await pageDetail.waitForXPath("//*[@id=\"description_table\"]/li");
        let df = await pageDetail.$x("//*[@id=\"description_table\"]/li");
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

        await pageDetail.$x("a.next_page");
        await pageDetail.close();
        console.log(renz);
        csvContent += `"${renz.name}","${renz.cost}","${renz.deposit}","${renz.prepaid}","${renz.electric}","${renz.water}","${renz.internet},"${renz.link}",${renz.latitude},${renz.longitude}"\n`;
        allRenz.push(renz);
      }
    } catch (e) {
      console.error(e.message);
    }
  }

  fs.writeFile('renz-cc.csv', csvContent, function (err) {
    if (err) return console.log(err);
  });
  // close the browser
  await browser.close();
})();
