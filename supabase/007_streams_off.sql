-- 007_streams_off.sql — «Потоки» на паузе: выключаем автосоздание и очищаем потоки.
-- Раньше файл ещё и удалял все потоки — это убрано, данные не трогает.
-- Таблица потоков остаётся — раздел вернётся позже. Можно запускать повторно.
begin;

drop trigger if exists trg_io_launch on item_offers;
drop trigger if exists trg_item_close_launch on request_items;
drop trigger if exists trg_im_launch on item_managers;

-- Очистка потоков убрана: в «Потоках» теперь живые данные из таблицы, повторный запуск их бы стёр.
-- delete from activities where launch_id is not null;
-- delete from launches;

commit;

notify pgrst, 'reload schema';
