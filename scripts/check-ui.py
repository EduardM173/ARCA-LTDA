"""Serial UI smoke check using the existing shared Selenium environment."""
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
driver_path = Path.home() / '.cache/selenium/chromedriver/win64/156.0.8078.47/chromedriver.exe'
driver = webdriver.Chrome(service=Service(str(driver_path)), options=options)
wait = WebDriverWait(driver, 20)
try:
    driver.get('http://localhost:5173')
    wait.until(EC.presence_of_element_located((By.NAME, 'email')))
    driver.save_screenshot('.runtime/ui-login.png')
    access = Path('.runtime/initial-access.txt').read_text(encoding='utf-8').splitlines()
    email = next(s.split(': ', 1)[1] for s in access if s.startswith('Correo:'))
    password = next(s.split(': ', 1)[1] for s in access if s.startswith('Contraseña temporal:'))
    driver.find_element(By.NAME, 'email').send_keys(email)
    driver.find_element(By.NAME, 'password').send_keys(password)
    driver.find_element(By.CSS_SELECTOR, 'button.primary').click()
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, '.stats')))
    wait.until(lambda d: d.find_element(By.CSS_SELECTOR, '.stats article strong').text == '0')
    assert 'Boletas' not in [e.text for e in driver.find_elements(By.CSS_SELECTOR, 'nav button')]
    driver.save_screenshot('.runtime/ui-home.png')
    for width in [1280, 768, 375]:
        driver.set_window_size(width, 900)
        assert driver.execute_script('return document.documentElement.scrollWidth <= window.innerWidth'), f'Overflow at {width}'
        driver.save_screenshot(f'.runtime/ui-home-{width}.png')
    driver.find_element(By.XPATH, '//nav/button[contains(.,"Personal")]').click()
    wait.until(EC.element_to_be_clickable((By.XPATH, '//button[contains(.,"Nuevo funcionario")]'))).click()
    assert driver.find_element(By.NAME, 'departmentId').tag_name == 'select'
    assert driver.find_element(By.NAME, 'hiredAt').get_attribute('type') == 'date'
    print('PASS login, navigation by role, employee form and widths 1280/768/375')
finally:
    driver.quit()
