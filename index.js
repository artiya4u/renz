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
let csvHeader = "Name,Cost,Deposit,Prepaid,Electric,Water,Internet,Link,Latitude,Longitude\n";
const maxPage = 5;
const baseUrl = 'https://renthub.in.th/';
const lines = ['bts', 'bts-silom', 'mrt', 'mrt-purple', 'airport-link'];
let title = "";

(async () => {
  // set some options (set headless to false so we can see
  // this automated browsing experience)
  let launchOptions = {headless: true, args: ['--start-maximized']};

  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();

  // set viewport and user agent (just in case for nice viewing)
  await page.setViewport({width: 1920, height: 1080});
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36');

  await page.goto(baseUrl);

  for (let line of lines) {
    // wait for element defined by XPath appear in page
    let stations = await page.$$eval(`div.${line} > i > div > a:nth-child(odd)`, elements => {
      return elements.map(e => e.getAttribute('href'));
    });

    for (let station of stations) {
      console.log(station)
      title = station.split('/')[2].trim()
      console.log(title)
      let stationContent = csvHeader;
      for (let pageIndex = 1; pageIndex <= maxPage; pageIndex++) {
        try {
          // go to the target web
          await page.goto(`${baseUrl}/${station}/${pageIndex}`);

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
            stationContent += `"${renz.name}","${renz.costs}","${renz.deposit}","${renz.prepaid}","${renz.electric}","${renz.water}","${renz.internet}","${renz.link}",${renz.latitude},${renz.longitude}\n`;
          }
        } catch (e) {
          console.error(e.message);
        }
      }
      fs.writeFile(`${title}-${new Date().getTime()}.csv`, stationContent, function (err) {
        if (err) return console.log(err);
      });
    }
  }

  // close the browser
  await browser.close();
})();
