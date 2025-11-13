# Инструкция по развертыванию и тестированию

## Вариант 1: GitHub Pages (Рекомендуется)

1. Перейдите на https://github.com/kvadrantul/poligraf-/settings/pages
2. В разделе "Source" выберите:
   - Branch: `main`
   - Folder: `/ (root)`
3. Нажмите "Save"
4. Подождите 1-2 минуты, пока GitHub Pages развернет сайт
5. Ваш URL будет: `https://kvadrantul.github.io/poligraf-/`

## Вариант 2: Vercel (Быстрый деплой)

1. Перейдите на https://vercel.com
2. Войдите через GitHub
3. Нажмите "New Project"
4. Выберите репозиторий `kvadrantul/poligraf-`
5. Нажмите "Deploy"
6. Получите URL вида: `https://poligraf-xxx.vercel.app`

## Настройка Telegram бота

1. Откройте [@BotFather](https://t.me/BotFather) в Telegram
2. Отправьте команду `/newbot` или выберите существующего бота
3. Отправьте команду `/newapp` или `/mybots` → выберите бота → "Bot Settings" → "Menu Button"
4. Укажите:
   - Title: `Poligraf`
   - Description: `Mini App для работы с комментариями`
   - Web App URL: `https://kvadrantul.github.io/poligraf-/` (или ваш Vercel URL)
5. Готово! Теперь в боте появится кнопка для открытия Mini App

## Тестирование

После настройки:
1. Откройте вашего бота в Telegram
2. Нажмите на кнопку меню (или кнопку внизу экрана)
3. Mini App откроется в Telegram

