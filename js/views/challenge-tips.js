const groups = [
  [
    'go_parry street_parry normal_parry ranked_parry',
    'Следи за замахом на тяжёлый удар. Когда соперник взял разгон и уже сближается, нажми парри до контакта. Потренируйся с другом: пусть он чередует тяжёлый удар и ложный заход.',
    'Watch for the heavy melee wind-up. Parry as the attacker commits, before contact. Practice with a friend alternating heavy attacks and feints.',
  ],
  [
    'ab_no1 ab_no2 ab_no3 ab_no_ult ab_ult_only',
    'Перед выходом на линию посмотри на панель умений и назови разрешённые кнопки. Заранее выбери способ отступления без запрещённого умения.',
    'Check your ability bar before laning. Identify the allowed buttons and plan an escape that does not need the restricted ability.',
  ],
  [
    'ab_rotate',
    'После каждого применения запоминай следующий номер. Если нужная способность ещё восстанавливается, пережди за укрытием.',
    'Keep track of the next slot after every cast. Use cover while waiting for that ability to recharge.',
  ],
  [
    'it_no_weapon it_no_vit it_no_spirit it_one_branch it_cheap it_active it_no_heal',
    'До первой покупки проверь в магазине ветку, тир и эффект намеченного предмета. Заранее выбери допустимую замену для первой покупки, которая нарушила бы правило.',
    'Before shopping, check the branch, tier and effect of your planned items. Pick a legal substitute for the first purchase that would break the rule.',
  ],
  [
    'gp_nomap tm_noping',
    'Договорись с союзником о коротких голосовых сигналах: кто пропал с линии и с какой стороны подходит.',
    'Agree on short voice calls with an ally: who left lane and from which side they are approaching.',
  ],
  [
    'gp_nojump gp_nozip ch_lane ch_nobase ch_friend_lane',
    'Перед стартом выбери короткий наземный маршрут к укрытию и магазину в пределах разрешённой зоны. Проверь его до первого боя.',
    'Plan a short ground route to cover and a shop within the allowed area. Walk it before the first fight.',
  ],
  [
    'gp_nohead gp_noads',
    'Держи прицел на уровне груди и отрабатывай короткие очереди на солдатах перед разменом с героем.',
    'Keep the crosshair at chest height and practice short bursts on troopers before trading with a hero.',
  ],
  [
    'gp_melee street_melee street_heavy_hit',
    'Сократи дистанцию из-за укрытия. Выбери тип удара и цель по условию; для тяжёлой атаки дождись, пока соперник отвлечётся на союзника.',
    'Close the gap from cover. Match the attack and target to the rule; for a heavy attack, wait until the enemy is facing an ally.',
  ],
  [
    'gp_ally tm_follow ranked_rejoin',
    'Выбери конкретного напарника. Перед выходом из магазина или с линии проверь его позицию и договорись о точке встречи.',
    'Pick a partner. Check their position before leaving the shop or lane and agree on a meeting point.',
  ],
  [
    'gp_nobuy ch_buydeath',
    'Составь список заранее. Перед каждым открытием магазина сверяйся с разрешённым моментом покупки.',
    'Plan a shopping list in advance. Before each purchase, check whether its timing is allowed.',
  ],
  [
    'go_lasthits ranked_denies ranked_secure',
    'Следи за здоровьем одного солдата и оставь патроны для последнего попадания или сферы. Для задания на сферы проверь, чью именно нужно подстрелить.',
    'Track one trooper’s health and save ammunition for the finishing shot or orb. For orb challenges, check which side’s orb counts.',
  ],
  [
    'go_walker go_guardian street_chip normal_routes ranked_pressure ranked_together team_first_structure ranked_chip street_guardian_finish',
    'Дождись подхода своей волны. Проверь название постройки и нанеси урон сам. Если нужен последний удар, следи за остатком здоровья и сохрани патроны на добивание.',
    'Wait for a friendly wave. Check the structure type and damage it yourself. If the rule requires the last hit, save ammunition for the finish.',
  ],
  [
    'go_zero_death team_quiet_start map_survive_10 street_first_round_survive street_survivor team_clean_fight street_kill_streak',
    'До размена наметь путь назад и оставь выносливость для отхода. После удачной атаки перегруппируйся, прежде чем преследовать следующую цель.',
    'Choose a retreat route and reserve stamina before trading. Regroup after a successful attack before chasing another target.',
  ],
  [
    'go_headshots',
    'Начни с короткой дистанции и цели, которая движется предсказуемо. Стреляй короткими очередями на высоте головы.',
    'Start close to a target moving predictably. Fire short bursts at head height.',
  ],
  [
    'go_souls',
    'Совмещай добивания на линии с короткими маршрутами по нейтралам. Сверяй общий заработок в статистике, включая потраченное.',
    'Combine lane last hits with short neutral routes. Check total souls earned, including purchases.',
  ],
  [
    'tm_blind tm_roles tm_shared ch_swap',
    'Договоритесь до матча о выборе героя, распределении ролей или списке покупок по условию. При смене героя зафиксируй выбор для следующей игры.',
    'Agree on the hero, roles or shopping list specified in the rule before playing. For a hero swap, record the choice for the next game.',
  ],
  [
    'ch_zip normal_zip_ride normal_teleporter map_all_lanes',
    'Сначала определи точку выхода. Сделай переход после зачистки волны, пока твоя постройка защищена; для нескольких линий запоминай уже посещённые.',
    'Choose the exit first. Rotate after clearing a wave while your structure is safe; keep track of lanes already visited.',
  ],
  [
    'go_assists ranked_assist ranked_impact ranked_win normal_first_assist street_participate normal_teamplay team_even_contribution street_follow',
    'Выбери цель, которую уже атакует напарник, и помоги до её гибели. Сверяй содействия в таблице матча; если нужны разные союзники, запоминай их отдельно.',
    'Help with the target your teammate is already attacking before it falls. Check assists on the scoreboard and track distinct teammates separately when required.',
  ],
  [
    'street_opening street_rounds street_pair street_three street_sweep street_first_round_win',
    'В начале раунда выбери одну цель вместе с командой. Между раундами запоминай, где уже был зачёт: вклад в одном раунде не переносится в другой.',
    'Pick one target with your team at round start. Track which rounds qualified; contributions in different rounds are counted separately.',
  ],
  [
    'street_draft street_draft_read ranked_scout',
    'Пока открыт экран выбора, сравни два предмета по эффекту и ветке. Если задание про соперника, открой его покупки до своей первой покупки.',
    'Compare two effects and branches on the selection screen. For scouting, inspect the opposing laner’s purchases before buying anything.',
  ],
  [
    'street_active normal_experiment normal_tool ranked_item',
    'Проверь кнопку активного слота и заранее выбери цель для эффекта. Засчитывай применение после попадания или срабатывания; запоминай нужные раунды отдельно.',
    'Check your active-item key and pick a target in advance. Count a use when its effect lands or triggers, tracking rounds separately if required.',
  ],
  [
    'street_cover street_cover_once street_reload',
    'До выхода на прострел найди ближайшую стену. Уходи за неё сразу после размена и перезаряжайся только там, где соперник потерял прямую видимость.',
    'Identify a nearby wall before peeking. Return after the trade and reload out of enemy sight.',
  ],
  [
    'street_objective ranked_objective',
    'До конца драки отметь ближайшую доступную постройку. После победы двигайся к ней вместе с волной, пока ещё идёт нужный раунд или временное окно.',
    'Identify the nearest reachable structure before the fight ends. Push with your wave while the round or time window still qualifies.',
  ],
  [
    'street_finish street_ult map_ability_hit street_hero_damage',
    'Проверь дальность способности на безопасной дистанции. Для добивания сохрани её до низкого здоровья цели; для нескольких попаданий считай только попадания по героям.',
    'Check ability range from safety. Save it for low health if a finishing blow is required; for repeated hits, count only enemy heroes.',
  ],
  [
    'normal_roamer normal_respawn_strike map_early_impact ranked_first_blood ranked_revenge team_trade_kill',
    'Выбери нужного противника до входа в бой и сближайся вместе с союзником. Если есть окно после события, посмотри на игровые часы сразу в момент его начала.',
    'Identify the required opponent before committing and approach with an ally. For timed windows, note the game clock as soon as the triggering event occurs.',
  ],
  [
    'normal_courier ranked_urn normal_urn_pickup',
    'Проверь место урны и точку доставки. Заранее определи носителя и того, кто проверит последний проход: подбор, сопровождение и доставка — разные действия.',
    'Locate the urn and delivery point. Assign a carrier and a final-approach scout: pickup, escort and delivery are distinct actions.',
  ],
  [
    'normal_collector normal_jungle normal_first_camp',
    'Выбери точку рядом с текущей линией. Для зачистки проверь, что не осталось нейтралов; для усилений запоминай тип, а не только место подбора.',
    'Pick a nearby location. For camps check that no neutral remains; for buffs track their type as well as their location.',
  ],
  [
    'ranked_calls street_ping ranked_first_assist ranked_signal_back',
    'Найди команду нужного пинга до боя. Отметь видимую цель или путь отхода именно в момент, указанный в условии.',
    'Find the relevant ping before combat. Mark the visible target or retreat at the moment specified by the rule.',
  ],
  [
    'ranked_defend ranked_wave',
    'Встань сбоку от союзной постройки и сначала разбери волну. Проверь, не остался ли солдат за углом, прежде чем уходить.',
    'Defend from beside the friendly structure and clear the wave first. Check for a trooper behind cover before leaving.',
  ],
  [
    'street_low_hp_kill',
    'Следи за своим здоровьем перед добиванием. Дождись ослабленной цели за укрытием вместо открытого размена на низком здоровье.',
    'Check your health before the finishing hit. Wait behind cover for a weakened target instead of trading in the open.',
  ],
  [
    'team_ult_chain team_save_ally team_two_fronts',
    'До боя назначьте цель или линии и договоритесь о голосовом отсчёте. Первый игрок сообщает о начале действия, второй подтверждает попадание и номер попытки.',
    'Assign a target or lanes and agree on a countdown. The first player calls the action; the second confirms the hit and attempt number.',
  ],
  [
    'bebop_hook infernus_ignite',
    'Запоминай имена героев после успешного попадания или поджога. Повтор по той же цели не увеличивает число разных противников.',
    'Track enemy names after each hook or ignition. Repeating the effect on the same hero does not add a distinct target.',
  ],
  [
    'haze_sleep_kill',
    'Подготовь ослабленную цель и предупреди союзников о дротике: лишнее попадание может разбудить противника до добивания.',
    'Set up a weakened target and call the dart so an extra hit does not wake the target before the finisher.',
  ],
  [
    'lash_death_slam seven_storm_cloud',
    'Выбери место, где противники уже собрались у прохода или цели. Перед ультой проверь, сколько разных героев реально окажется в зоне одного применения.',
    'Look for opponents grouped near a choke or objective. Before casting, count how many distinct heroes can be hit by that single ultimate.',
  ],
  [
    'shiv_killing_blow vindicta_assassinate',
    'Сохрани заряд для ослабленного героя. Проверь порог добивания или дистанцию до цели перед выстрелом, в зависимости от условия.',
    'Save the cast for a weakened hero. Check the execute threshold or shot distance before committing, according to the objective.',
  ],
  [
    'abrams_wall_pin',
    'Перед рывком встань так, чтобы за героем была стена. В тренировке сравни прямой заход и заход вдоль стены — для прижатия нужен первый.',
    'Line up with a wall directly behind the target. In practice, compare charging toward a wall with charging parallel to it.',
  ],
];
export const challengeTips = new Map(
  groups.flatMap(([ids, ru, en]) => ids.split(' ').map((id) => [id, { ru, en }])),
);
