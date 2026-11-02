import json,sys
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait,Select
f=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'));o=webdriver.ChromeOptions();o.add_argument('--headless=new');o.add_argument('--disable-gpu');o.add_argument('--window-size=1280,900');d=webdriver.Chrome(service=Service(str(Path.home()/'.cache/selenium/chromedriver/win64/156.0.8078.47/chromedriver.exe')),options=o);w=WebDriverWait(d,30)
def ready_select(driver):
 try:
  el=driver.find_element(By.XPATH,'//label[normalize-space(text())="Funcionario"]/select');return el if any(x.get_attribute('value')==f['employeeId'] and f['name'] in x.text for x in el.find_elements(By.TAG_NAME,'option')) else False
 except Exception:return False
try:
 d.get('http://localhost:5173');w.until(lambda x:x.find_element(By.NAME,'email')).send_keys(f['email']);d.find_element(By.NAME,'password').send_keys(f['password']);d.find_element(By.XPATH,'//button[contains(.,"Iniciar sesión")]').click();w.until(lambda x:x.find_element(By.CSS_SELECTOR,'nav'))
 for index,tab in enumerate(['Contratos','Boletas','Vacaciones']):
  d.find_element(By.XPATH,'//nav/button[contains(.,"'+tab+'")]').click()
  if index==0:Select(w.until(ready_select)).select_by_value(f['employeeId'])
  w.until(lambda x:ready_select(x) and ready_select(x).get_attribute('value')==f['employeeId'])
  search=d.find_element(By.XPATH,'//input[@placeholder="Nombre o código"]');search.send_keys('NO-MATCH-THIS-CONTEXT')
  w.until(lambda x:ready_select(x) and ready_select(x).get_attribute('value')==f['employeeId'])
  # Wait for the actual search response, then verify the selected fallback was not lost.
  w.until(lambda x:'Consultando' not in ready_select(x).text if ready_select(x) else False)
  result=d.execute_async_script('const done=arguments[arguments.length-1];fetch("/api/v1/employees?q=NO-MATCH-THIS-CONTEXT").then(r=>r.json()).then(done)');assert result['total']==0
  assert ready_select(d).get_attribute('value')==f['employeeId']
 d.save_screenshot('.runtime/context-ui-selected.png');print('PASS selected employee remains labelled and selected across Contracts/Payments/Vacations when search has zero matches')
finally:d.quit()
