"""Real browser smoke check for local demo accounts; never prints passwords."""
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

rows = [x.split('|') for x in Path('README_DEMO_LOCAL.md').read_text(encoding='utf-8').splitlines() if x.startswith('| ') and x.split('|')[1].strip().isdigit()]
assert len(rows) == 30
options = webdriver.ChromeOptions()
options.add_argument('--headless=new')
browser = webdriver.Chrome(options=options)
try:
    browser.set_window_size(1280, 900)
    wait = WebDriverWait(browser, 20)
    for number, section, expected in [(1, 'Administración', 'Administración'), (3, 'Personal', 'Funcionarios'), (11, 'Vacaciones', 'Vacaciones'), (17, 'Boletas', '2026-11'), (23, 'Inicio', 'Resumen de trabajo'), (26, 'Vacaciones', 'Vacaciones'), (29, 'Vacaciones', 'Vacaciones')]:
        row = rows[number-1]
        browser.get('http://localhost:5173/')
        wait.until(lambda d: d.find_elements(By.NAME, 'email'))
        browser.find_element(By.NAME, 'email').send_keys(row[3].strip())
        browser.find_element(By.NAME, 'password').send_keys(row[4].strip())
        browser.find_element(By.CSS_SELECTOR, 'button.primary').click()
        wait.until(lambda d: 'Cerrar sesión' in d.page_source)
        browser.find_element(By.XPATH, f'//nav//button[contains(.,"{section}")]').click()
        wait.until(lambda d: expected in d.find_element(By.TAG_NAME, 'main').text)
        if number == 1:
            browser.find_element(By.XPATH, '//nav//button[contains(.,"Personal")]').click()
            wait.until(lambda d: 'DEMO-ARCA-' in d.find_element(By.TAG_NAME, 'main').text)
        elif number == 17:
            wait.until(lambda d: '2026-11' in d.find_element(By.TAG_NAME, 'main').text)
        print(f'PASS navegador demo: perfil {number}, módulo {section}')
        browser.find_element(By.XPATH, '//header//button[contains(.,"Cerrar sesión")]').click()
        wait.until(lambda d: d.find_elements(By.NAME, 'email'))
    row = rows[29]
    browser.get('http://localhost:5173/')
    wait.until(lambda d: d.find_elements(By.NAME, 'email'))
    browser.find_element(By.NAME, 'email').send_keys(row[3].strip())
    browser.find_element(By.NAME, 'password').send_keys(row[4].strip())
    browser.find_element(By.CSS_SELECTOR, 'button.primary').click()
    wait.until(lambda d: 'Correo o contraseña incorrectos' in d.page_source)
    print('PASS navegador demo: cuenta desactivada rechazada')
finally:
    browser.quit()
