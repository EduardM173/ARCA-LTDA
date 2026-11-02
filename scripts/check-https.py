"""Local HTTPS fixture only: accept the self-signed certificate in this browser."""
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

options = webdriver.ChromeOptions()
options.add_argument('--headless=new')
options.add_argument('--disable-gpu')
options.add_argument('--window-size=1280,900')
options.set_capability('acceptInsecureCerts', True)
driver_path = Path.home() / '.cache/selenium/chromedriver/win64/156.0.8078.47/chromedriver.exe'
driver = webdriver.Chrome(service=Service(str(driver_path)), options=options)
wait = WebDriverWait(driver, 25)
try:
    driver.get('https://localhost:5181')
    wait.until(EC.presence_of_element_located((By.NAME, 'email')))
    lines = Path('.runtime/initial-access.txt').read_text(encoding='utf-8').splitlines()
    email = next(line.split(': ', 1)[1] for line in lines if line.startswith('Correo:'))
    password = next(line.split(': ', 1)[1] for line in lines if line.startswith('Contraseña temporal:'))
    driver.find_element(By.NAME, 'email').send_keys(email)
    driver.find_element(By.NAME, 'password').send_keys(password)
    driver.find_element(By.CSS_SELECTOR, 'button.primary').click()
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, 'nav')))
    cookie = driver.get_cookie('arca_session')
    assert cookie and cookie['secure'] and cookie['httpOnly'] and cookie['sameSite'] == 'Strict'
    result = driver.execute_async_script("""
      const done=arguments[0];
      fetch('/api/v1/auth/me',{credentials:'same-origin'})
        .then(r=>done({status:r.status,cache:r.headers.get('cache-control')}))
        .catch(()=>done({status:0}));
    """)
    assert result['status'] == 200 and 'no-store' in result['cache']
    print('PASS HTTPS: real browser login, Secure/HttpOnly/SameSite=Strict cookie, authenticated API and no-store response. Self-signed trust was limited to this test browser.')
finally:
    driver.quit()
