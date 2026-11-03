import os
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

options = Options()
for flag in ('--headless=new', '--disable-gpu', '--disable-extensions', '--renderer-process-limit=1'):
    options.add_argument(flag)
browser = webdriver.Chrome(options=options)
try:
    browser.set_window_size(1280, 900)
    browser.get('http://localhost:5173/')
    wait = WebDriverWait(browser, 15)
    wait.until(lambda d: d.find_elements(By.CSS_SELECTOR, 'input[name=email]'))
    browser.find_element(By.CSS_SELECTOR, 'input[name=email]').send_keys(os.environ['ARCA_FIXTURE_EMAIL'])
    browser.find_element(By.CSS_SELECTOR, 'input[name=password]').send_keys(os.environ['ARCA_FIXTURE_PASSWORD'])
    browser.find_element(By.CSS_SELECTOR, 'button.primary').click()
    wait.until(lambda d: 'Cerrar sesión' in d.page_source)
    month = browser.execute_script("return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/La_Paz'}).format(new Date()).slice(0,7)")
    wait.until(lambda d: d.execute_script('return performance.getEntriesByType("resource").some(e=>e.name.includes("payments/summary?period="+arguments[0]))', month))
    assert month in browser.find_element(By.CSS_SELECTOR, '.stats').text
    print('Finance current-period summary UI PASS')
    assert not browser.find_elements(By.XPATH, '//nav//button[contains(.,"Personal")]')
    assert browser.find_elements(By.XPATH, '//nav//button[contains(.,"Boletas")]')
    browser.find_element(By.XPATH, '//nav//button[contains(.,"Boletas")]').click()
    wait.until(lambda d: 'Boletas y pagos' in d.page_source)
    wait.until(lambda d: 'No hay conceptos activos' in d.page_source)
    assert not browser.find_element(By.XPATH, '//button[contains(.,"Preparar boleta")]').is_enabled()
    assert 'Servicio no disponible' not in browser.page_source
    print('Finance payment prerequisites UI PASS')
    browser.find_element(By.XPATH, '//nav//button[contains(.,"Administración")]').click()
    wait.until(lambda d: 'Auditoría por dominio' in d.page_source)
    assert browser.find_element(By.XPATH, '//label[contains(.,"Dominio")]/select').get_attribute('value') == 'payments'
    actor = browser.find_element(By.XPATH, '//label[contains(.,"Actor (ID)")]/input')
    actor.send_keys('incompleto')
    wait.until(lambda d: 'Complete el ID del actor' in d.page_source)
    actor.clear()
    actor.send_keys(' ')
    wait.until(lambda d: actor.get_attribute('value') == '' and 'Complete el ID del actor' not in d.find_element(By.TAG_NAME, 'body').text)
    assert 'Usuarios y permisos' not in browser.page_source
    assert 'Catálogos' not in browser.page_source
    assert 'Servicio no disponible' not in browser.page_source
    print('Finance-only audit UI PASS')
finally:
    browser.quit()
