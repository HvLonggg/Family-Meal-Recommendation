import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { MealCelebration } from '@/components/recipes/MealCelebration';
import { MealRoleIcon } from '@/components/recipes/MealRoleIcon';
import { SearchField } from '@/components/common/SearchField';
import {
  calculateMealStats,
  createMealSlots,
  getCandidates,
  getNextWheelRotation,
  pickRandomDish,
  profileDetails,
  restoreMealSlots,
  roleDetails,
  type MealProfile,
  type MealRole,
  type MealSlot,
  type SavedRandomMeal,
} from '@/data/randomMeals';
import { useAuth } from '@/features/auth/AuthContext';
import { apiPost, apiRequest } from '@/lib/api/client';
import { matchesSearch } from '@/lib/search';
import { useI18n } from '@/features/i18n/I18nContext';

const STORAGE_KEY_PREFIX = 'bep-viet-random-meal-history-v1';
const SPIN_DURATION_MS = 1250;
const wheelColors = ['#a35341', '#c39252', '#6b8057', '#77938b', '#967b61', '#af7170'];
const profileIcons = {
  balanced: 'balance',
  light: 'leaf',
  quick: 'clock',
  family: 'home',
} as const;
type RemoteSavedMeal = {
  id: string;
  profile: MealProfile;
  dish_ids: string[];
  created_at: string;
};

function historyStorageKey(userId: string | null | undefined) {
  return `${STORAGE_KEY_PREFIX}:${userId ?? 'guest'}`;
}

function readHistory(userId: string | null | undefined): SavedRandomMeal[] {
  try {
    const stored = localStorage.getItem(historyStorageKey(userId));
    return stored ? (JSON.parse(stored) as SavedRandomMeal[]) : [];
  } catch {
    return [];
  }
}

function writeHistory(history: SavedRandomMeal[], userId: string | null | undefined) {
  try {
    localStorage.setItem(historyStorageKey(userId), JSON.stringify(history));
    return true;
  } catch {
    return false;
  }
}

function createHistoryId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function getRandomIndex(length: number) {
  return Math.floor(Math.random() * length);
}

function polarPosition(angle: number, radius: number): CSSProperties {
  const radians = (angle * Math.PI) / 180;
  return {
    left: `${50 + Math.sin(radians) * radius}%`,
    top: `${50 - Math.cos(radians) * radius}%`,
  };
}

function fromRemoteMeal(meal: RemoteSavedMeal): SavedRandomMeal {
  return {
    id: meal.id,
    createdAt: meal.created_at,
    profile: meal.profile,
    dishIds: meal.dish_ids,
  };
}

export function RandomMealPage() {
  const { user } = useAuth();
  const { formatDate, locale, t } = useI18n();
  const roleLabel = (key: MealRole) => t(roleDetails[key].label).toLocaleLowerCase(locale);
  const [dishCount, setDishCount] = useState(4);
  const [profile, setProfile] = useState<MealProfile>('balanced');
  const [slots, setSlots] = useState<MealSlot[]>(() => createMealSlots(4));
  const [focusedSlot, setFocusedSlot] = useState<number | null>(null);
  const [historyByAccount, setHistoryByAccount] = useState<Record<string, SavedRandomMeal[]>>(
    () => ({ guest: readHistory(null) }),
  );
  const historyOwnerKey = user?.id ?? 'guest';
  const history = historyByAccount[historyOwnerKey] ?? readHistory(user?.id);
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyProfile, setHistoryProfile] = useState<'all' | MealProfile>('all');
  const [historyDishCount, setHistoryDishCount] = useState<'all' | number>('all');
  const [rotation, setRotation] = useState(0);
  const rotationRef = useRef(0);
  const [spinning, setSpinning] = useState(false);
  const [activeSpinSlot, setActiveSpinSlot] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(() => t('Chọn tiêu chuẩn rồi quay món đầu tiên nhé.'));
  const timerRef = useRef<number | null>(null);
  const [celebrationId, setCelebrationId] = useState<number | null>(null);
  const celebrationSequenceRef = useRef(0);
  const dismissCelebration = useCallback(() => setCelebrationId(null), []);
  const celebrateMeal = () => {
    celebrationSequenceRef.current += 1;
    setCelebrationId(celebrationSequenceRef.current);
  };

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!user) return;
    let active = true;
    void apiRequest<RemoteSavedMeal[]>('/saved-meals')
      .then((items) => {
        if (!active) return;
        const remoteHistory = items.map(fromRemoteMeal);
        setHistoryByAccount((current) => ({ ...current, [user.id]: remoteHistory }));
        writeHistory(remoteHistory, user.id);
      })
      .catch(() => {
        // Giữ lịch sử cục bộ khi API tạm thời không khả dụng.
      });
    return () => {
      active = false;
    };
  }, [user]);

  const selectedDishes = useMemo(
    () => slots.flatMap((slot) => (slot.dish ? [slot.dish] : [])),
    [slots],
  );
  const stats = useMemo(() => calculateMealStats(slots), [slots]);
  const isComplete = selectedDishes.length === slots.length;
  const remainingIndexes = slots.flatMap((slot, index) => (slot.dish ? [] : [index]));
  const wheelIndexes = slots.map((_, index) => index);
  const selectedSourceKeys = selectedDishes.map((dish) => dish.sourceKey);
  const filteredHistory = useMemo(() => {
    return history.filter((meal) => {
      const savedSlots = restoreMealSlots(meal.dishIds);
      if (historyProfile !== 'all' && meal.profile !== historyProfile) return false;
      if (historyDishCount !== 'all' && savedSlots.length !== historyDishCount) return false;
      return matchesSearch(historyQuery, [
        t(profileDetails[meal.profile].label),
        ...savedSlots.map((slot) => slot.dish?.name ?? ''),
      ]);
    });
  }, [history, historyDishCount, historyProfile, historyQuery, t]);

  const changeDishCount = (count: number) => {
    dismissCelebration();
    setDishCount(count);
    setSlots(createMealSlots(count));
    setFocusedSlot(null);
    setNotice(t('Đã chuẩn bị mâm trống {count} món. Bắt đầu quay thôi!', { count }));
  };

  const changeProfile = (value: MealProfile) => {
    dismissCelebration();
    setProfile(value);
    setSlots(createMealSlots(dishCount));
    setFocusedSlot(null);
    setNotice(
      t('Đã chọn tiêu chuẩn “{profile}”. Mâm được làm mới.', {
        profile: t(profileDetails[value].label),
      }),
    );
  };

  const rotateWheelToSlot = (slotIndex: number, indexes = wheelIndexes) => {
    const segmentIndex = indexes.indexOf(slotIndex);
    rotationRef.current = getNextWheelRotation(rotationRef.current, segmentIndex, indexes.length);
    setRotation(rotationRef.current);
  };

  const animateAndCommit = (slotIndex: number, commit: () => void) => {
    rotateWheelToSlot(slotIndex);
    setSpinning(true);
    setActiveSpinSlot(slotIndex);
    setNotice(t('Đang tìm {role} hợp mâm…', { role: roleLabel(slots[slotIndex]!.role) }));
    timerRef.current = window.setTimeout(() => {
      commit();
      setSpinning(false);
      setFocusedSlot(null);
      setActiveSpinSlot(null);
      timerRef.current = null;
    }, SPIN_DURATION_MS);
  };

  const spinOne = (requestedSlot?: number) => {
    if (spinning) return;
    dismissCelebration();
    const targetIndexes =
      requestedSlot !== undefined
        ? [requestedSlot]
        : focusedSlot !== null
          ? [focusedSlot]
          : remainingIndexes.length
            ? remainingIndexes
            : slots.map((_, index) => index);
    const targetIndex = targetIndexes[getRandomIndex(targetIndexes.length)]!;
    const targetSlot = slots[targetIndex]!;
    const previousSourceKey = targetSlot.dish?.sourceKey;
    const dish = pickRandomDish(
      targetSlot.role,
      profile,
      selectedSourceKeys.filter((key) => key !== previousSourceKey),
    );
    if (!dish) {
      setNotice(t('Chưa có món phù hợp với lựa chọn này. Bạn thử tiêu chuẩn khác nhé.'));
      return;
    }

    animateAndCommit(targetIndex, () => {
      setSlots((current) =>
        current.map((slot, index) => (index === targetIndex ? { ...slot, dish } : slot)),
      );
      const completesMeal = selectedDishes.length + (targetSlot.dish ? 0 : 1) === slots.length;
      if (completesMeal && !isComplete) celebrateMeal();
      setNotice(
        `${t('{name} đã được đặt vào mâm.', { name: dish.name })} ${completesMeal ? t('Mâm đã đủ, bạn có thể lưu lại.') : t('Quay tiếp nhé!')}`,
      );
    });
  };

  const spinEntireMeal = () => {
    if (spinning) return;
    dismissCelebration();
    const targets = remainingIndexes.length ? remainingIndexes : slots.map((_, index) => index);
    const nextSlots = slots.map((slot) => ({ ...slot }));
    const usedSourceKeys = selectedSourceKeys.filter(
      (key) => !targets.some((index) => slots[index]?.dish?.sourceKey === key),
    );
    if (targets.length === 0) return;

    setSpinning(true);
    setFocusedSlot(null);
    void (async () => {
      let completed = true;
      for (let step = 0; step < targets.length; step += 1) {
        const slotIndex = targets[step]!;
        const slot = nextSlots[slotIndex]!;
        const dish = pickRandomDish(slot.role, profile, usedSourceKeys);
        if (!dish) {
          setNotice(t('Chưa tìm được món phù hợp cho {role}.', { role: roleLabel(slot.role) }));
          completed = false;
          break;
        }

        setActiveSpinSlot(slotIndex);
        rotateWheelToSlot(slotIndex);
        setNotice(
          t('Đang quay món {step}/{total}: {role}…', {
            step: step + 1,
            total: targets.length,
            role: roleLabel(slot.role),
          }),
        );
        await new Promise<void>((resolve) => {
          timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            resolve();
          }, SPIN_DURATION_MS);
        });

        nextSlots[slotIndex] = { ...slot, dish };
        usedSourceKeys.push(dish.sourceKey);
        setSlots(nextSlots.map((item) => ({ ...item })));
        if (step < targets.length - 1) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 180));
        }
      }
      setSpinning(false);
      setActiveSpinSlot(null);
      if (completed && nextSlots.every((slot) => slot.dish !== null)) {
        celebrateMeal();
        setNotice(t('Mâm cơm đã đủ món và sẵn sàng để lưu.'));
      }
    })();
  };

  const saveMeal = async () => {
    if (!isComplete) {
      setNotice(
        t('Mâm còn thiếu {count} món. Hãy quay đủ trước khi lưu.', {
          count: slots.length - selectedDishes.length,
        }),
      );
      return;
    }
    setSaving(true);
    const saved: SavedRandomMeal = {
      id: createHistoryId(),
      createdAt: new Date().toISOString(),
      profile,
      dishIds: selectedDishes.map((dish) => dish.id),
    };
    let mealToStore = saved;
    let savedRemotely = false;
    if (user) {
      try {
        const remoteMeal = await apiPost<RemoteSavedMeal>('/saved-meals', {
          profile,
          dish_ids: saved.dishIds,
        });
        mealToStore = fromRemoteMeal(remoteMeal);
        savedRemotely = true;
      } catch {
        // Lưu cục bộ để người dùng không mất mâm vừa tạo khi kết nối gián đoạn.
      }
    }
    const nextHistory = [mealToStore, ...history].slice(0, 8);
    setHistoryByAccount((current) => ({ ...current, [historyOwnerKey]: nextHistory }));
    const savedOnDevice = writeHistory(nextHistory, user?.id);
    setNotice(
      savedRemotely
        ? t('Đã lưu mâm cơm vào tài khoản của bạn.')
        : user
          ? savedOnDevice
            ? t('Máy chủ chưa phản hồi. Mâm đã được lưu an toàn trên thiết bị này.')
            : t('Chưa thể lưu mâm cơm. Vui lòng thử lại.')
          : savedOnDevice
            ? t('Đã lưu mâm cơm vào lịch sử trên thiết bị này.')
            : t('Chưa thể lưu mâm cơm. Vui lòng thử lại.'),
    );
    setSaving(false);
  };

  const reuseMeal = (meal: SavedRandomMeal) => {
    dismissCelebration();
    const restored = restoreMealSlots(meal.dishIds);
    if (restored.length === 0) return;
    setDishCount(restored.length);
    setProfile(meal.profile);
    setSlots(restored);
    setFocusedSlot(null);
    setNotice(t('Đã đưa mâm cơm đã lưu trở lại bàn quay.'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetMeal = () => {
    dismissCelebration();
    setSlots(createMealSlots(dishCount));
    setFocusedSlot(null);
    setNotice(t('Mâm đã được dọn trống. Mời bạn quay lại từ đầu.'));
  };

  const gradient = wheelIndexes
    .map((_, index) => {
      const start = (index / wheelIndexes.length) * 100;
      const end = ((index + 1) / wheelIndexes.length) * 100;
      return `${wheelColors[index % wheelColors.length]} ${start}% ${end}%`;
    })
    .join(', ');

  return (
    <div className="page-wrap random-meal-page">
      {celebrationId !== null && (
        <MealCelebration key={celebrationId} onFinish={dismissCelebration} />
      )}
      <section className="random-hero">
        <div className="container random-hero__inner">
          <div>
            <span className="hero-kicker">
              <AppIcon name="sparkles" size={17} /> {t('Tiện ích chọn món')}
            </span>
            <h1>
              {t('Quay một vòng,')}
              <br />
              <em>{t('có ngay mâm cơm')}</em>
            </h1>
            <p>
              {t(
                'Đặt số món, chọn tiêu chuẩn dinh dưỡng và để Bếp Việt ghép một mâm cơm đủ vị cho nhà mình.',
              )}
            </p>
            <div className="random-hero__proof">
              <span>
                <AppIcon name="check" size={16} /> {t('Đúng nhóm món')}
              </span>
              <span>
                <AppIcon name="check" size={16} /> {t('Không trùng món')}
              </span>
              <span>
                <AppIcon name="check" size={16} /> {t('Lưu được lịch sử')}
              </span>
            </div>
          </div>
          <div className="random-hero__mini-tray" aria-hidden="true">
            {createMealSlots(4).map((slot, index) => (
              <span key={slot.role} style={{ '--mini-angle': `${index * 90}deg` } as CSSProperties}>
                <MealRoleIcon role={slot.role} />
              </span>
            ))}
            <strong>{t('{count} món', { count: 4 })}</strong>
          </div>
        </div>
      </section>

      <section className="random-builder-section">
        <div className="container">
          <div className="random-settings">
            <div>
              <span className="random-settings__step">01</span>
              <div>
                <strong>{t('Số món trên mâm')}</strong>
                <small>{t('Chọn từ 3 đến 6 món')}</small>
              </div>
              <div className="segmented-control" aria-label={t('Chọn số món')}>
                {[3, 4, 5, 6].map((count) => (
                  <button
                    className={dishCount === count ? 'is-active' : ''}
                    aria-pressed={dishCount === count}
                    disabled={spinning}
                    key={count}
                    onClick={() => changeDishCount(count)}
                    type="button"
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="random-settings__step">02</span>
              <div>
                <strong>{t('Tiêu chuẩn gợi ý')}</strong>
                <small>{t('Điều chỉnh cách hệ thống chọn món')}</small>
              </div>
              <div className="profile-options">
                {(Object.keys(profileDetails) as MealProfile[]).map((key) => (
                  <button
                    className={profile === key ? 'is-active' : ''}
                    aria-pressed={profile === key}
                    disabled={spinning}
                    key={key}
                    onClick={() => changeProfile(key)}
                    type="button"
                  >
                    <span className="profile-option__icon">
                      <AppIcon name={profileIcons[key]} size={22} />
                    </span>
                    <span>
                      <strong>{t(profileDetails[key].label)}</strong>
                      <small>{t(profileDetails[key].description)}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="random-workspace">
            <section className="wheel-panel" aria-labelledby="wheel-title">
              <div className="panel-heading">
                <span className="section-label">{t('Bước 03 · Quay món')}</span>
                <h2 id="wheel-title">{t('Vòng quay hôm nay ăn gì?')}</h2>
                <p>
                  {focusedSlot !== null
                    ? t('Đang chọn lại {role}.', { role: roleLabel(slots[focusedSlot]!.role) })
                    : t('Mỗi lượt quay sẽ điền một nhóm món còn thiếu vào mâm.')}
                </p>
              </div>
              <div className={`meal-wheel-wrap${spinning ? ' is-spinning' : ''}`}>
                <span className="meal-wheel__pointer" />
                <div
                  className={`meal-wheel${spinning ? ' is-spinning' : ''}`}
                  style={
                    {
                      '--wheel-gradient': `conic-gradient(from 0deg, ${gradient})`,
                      '--wheel-rotation': `${rotation}deg`,
                    } as CSSProperties
                  }
                >
                  {wheelIndexes.map((slotIndex, index) => {
                    const role = slots[slotIndex]!.role;
                    const angle = (index + 0.5) * (360 / wheelIndexes.length);
                    const candidates = getCandidates(
                      role,
                      profile,
                      selectedSourceKeys.filter((key) => key !== slots[slotIndex]!.dish?.sourceKey),
                    );
                    return (
                      <span
                        className={`meal-wheel__label${activeSpinSlot === slotIndex ? ' is-active' : ''}`}
                        key={`${slotIndex}-${role}`}
                        style={polarPosition(angle, 33)}
                      >
                        <span className="meal-wheel__symbol">
                          <MealRoleIcon role={role} />
                        </span>
                        <strong>{t(roleDetails[role].shortLabel)}</strong>
                        <small>{t('{count} lựa chọn', { count: candidates.length })}</small>
                      </span>
                    );
                  })}
                </div>
                <button
                  aria-label={t('Quay một món ngẫu nhiên')}
                  className="meal-wheel__button"
                  disabled={spinning}
                  onClick={() => spinOne()}
                  type="button"
                >
                  <AppIcon name="refresh" size={26} />
                  <strong>{spinning ? t('Đang quay') : t('Quay món')}</strong>
                </button>
              </div>
              <div className="wheel-actions">
                <button
                  className="button button--primary"
                  disabled={spinning}
                  onClick={spinEntireMeal}
                  type="button"
                >
                  <AppIcon name="sparkles" size={18} /> {t('Quay đủ cả mâm')}
                </button>
                <button
                  className="button button--outline"
                  disabled={spinning}
                  onClick={resetMeal}
                  type="button"
                >
                  {t('Làm mâm mới')}
                </button>
              </div>
              <p className="random-notice" aria-live="polite">
                {notice}
              </p>
            </section>

            <section className="tray-panel" aria-labelledby="tray-title">
              <div className="panel-heading panel-heading--tray">
                <div>
                  <span className="section-label">{t('Mâm cơm của bạn')}</span>
                  <h2 id="tray-title">
                    {t('{selected}/{total} món đã chọn', {
                      selected: selectedDishes.length,
                      total: slots.length,
                    })}
                  </h2>
                </div>
                <span className={`balance-badge${isComplete ? ' is-complete' : ''}`}>
                  <AppIcon name={isComplete ? 'check' : 'sparkles'} size={15} />
                  {isComplete ? t('Đã đủ mâm') : t('Đang ghép mâm')}
                </span>
              </div>

              <div
                className={`meal-tray meal-tray--${slots.length}`}
                aria-label={t('Mâm cơm {count} món', { count: slots.length })}
              >
                <div className="meal-tray__center">
                  <span>{isComplete ? '✓' : selectedDishes.length}</span>
                  <strong>{isComplete ? t('Trọn vị') : t('Đã có')}</strong>
                  <small>
                    {isComplete
                      ? t('mâm cơm nhà')
                      : t('{count} món', { count: selectedDishes.length })}
                  </small>
                </div>
                {slots.map((slot, index) => {
                  const angle = index * (360 / slots.length);
                  return (
                    <button
                      aria-label={
                        slot.dish
                          ? t('{role}: {name}. Bấm để quay đổi món.', {
                              role: t(roleDetails[slot.role].label),
                              name: slot.dish.name,
                            })
                          : t('{role} đang trống. Bấm để quay món này.', {
                              role: t(roleDetails[slot.role].label),
                            })
                      }
                      className={`tray-slot${slot.dish ? ' is-filled' : ''}${focusedSlot === index ? ' is-focused' : ''}`}
                      disabled={spinning}
                      key={`${slot.role}-${index}`}
                      onClick={() => {
                        setFocusedSlot(index);
                        if (!spinning)
                          setNotice(
                            slot.dish
                              ? t('Đã chọn ô {role}. Bấm “Quay món” để đổi món.', {
                                  role: roleLabel(slot.role),
                                })
                              : t('Đã chọn ô {role}. Bấm “Quay món” để thêm món.', {
                                  role: roleLabel(slot.role),
                                }),
                          );
                      }}
                      style={polarPosition(angle, 34)}
                      type="button"
                    >
                      <span className="tray-slot__plate">
                        {slot.dish ? (
                          <img alt={slot.dish.imageAlt} src={slot.dish.image} />
                        ) : (
                          <MealRoleIcon role={slot.role} />
                        )}
                      </span>
                      <span className="tray-slot__number">{index + 1}</span>
                    </button>
                  );
                })}
              </div>

              <p className="tray-hint">
                {t('Chọn món trên mâm hoặc danh sách bên dưới để quay đổi.')}
              </p>
              <div className="tray-menu" aria-label={t('Danh sách món trong mâm')}>
                {slots.map((slot, index) => (
                  <button
                    aria-label={
                      slot.dish
                        ? t('Chọn {role} để đổi món', { role: roleLabel(slot.role) })
                        : t('Chọn {role} để thêm món', { role: roleLabel(slot.role) })
                    }
                    aria-pressed={focusedSlot === index}
                    className={`tray-menu__item${focusedSlot === index ? ' is-focused' : ''}`}
                    disabled={spinning}
                    key={`${slot.role}-${index}`}
                    onClick={() => {
                      setFocusedSlot(index);
                      setNotice(
                        slot.dish
                          ? t('Đã chọn {role}. Bấm “Quay món” để đổi món.', {
                              role: roleLabel(slot.role),
                            })
                          : t('Đã chọn {role}. Bấm “Quay món” để thêm món.', {
                              role: roleLabel(slot.role),
                            }),
                      );
                    }}
                    type="button"
                  >
                    <span className="tray-menu__index">{index + 1}</span>
                    <span className="tray-menu__text">
                      <small>{t(roleDetails[slot.role].label)}</small>
                      <strong>{slot.dish?.name ?? t('Chưa chọn món')}</strong>
                    </span>
                    <AppIcon name={slot.dish ? 'refresh' : 'plus'} size={16} />
                  </button>
                ))}
              </div>

              <div className="nutrition-summary">
                <div>
                  <span>{t('Năng lượng')}</span>
                  <strong>
                    {stats.hasNutrition && stats.calories ? `${stats.calories} kcal` : '—'}
                  </strong>
                  <small>{stats.hasNutrition ? t('ước tính / người') : t('chưa có dữ liệu')}</small>
                </div>
                <div>
                  <span>{t('Chất đạm')}</span>
                  <strong>
                    {stats.hasNutrition && stats.protein ? `${stats.protein} g` : '—'}
                  </strong>
                  <small>{stats.hasNutrition ? t('ước tính / người') : t('chưa có dữ liệu')}</small>
                </div>
                <div>
                  <span>{t('Rau & quả')}</span>
                  <strong>
                    {stats.hasNutrition && stats.vegetableGrams ? `${stats.vegetableGrams} g` : '—'}
                  </strong>
                  <small>{stats.hasNutrition ? t('ước tính / người') : t('chưa có dữ liệu')}</small>
                </div>
                <div>
                  <span>{t('Thời gian')}</span>
                  <strong>
                    {stats.maxMinutes ? t('{count} phút', { count: stats.maxMinutes }) : '—'}
                  </strong>
                  <small>{t('món lâu nhất')}</small>
                </div>
              </div>
              <p className="nutrition-disclaimer">
                {t(
                  'Chỉ số mang tính tham khảo theo một khẩu phần người lớn, không thay thế tư vấn dinh dưỡng chuyên môn.',
                )}
              </p>
              <button
                className="button button--save-meal"
                disabled={!isComplete || saving || spinning}
                onClick={() => void saveMeal()}
                type="button"
              >
                <AppIcon name="save" size={18} />
                {saving ? t('Đang lưu mâm cơm…') : t('Lưu mâm cơm này')}
              </button>
            </section>
          </div>
        </div>
      </section>

      <section className="saved-meals-section">
        <div className="container">
          <div className="section-heading saved-meals-heading">
            <div>
              <span className="section-label">{t('Lịch sử của bạn')}</span>
              <h2>{t('Mâm cơm đã lưu')}</h2>
              <p>
                {user
                  ? t('Tối đa 8 mâm gần nhất được đồng bộ với tài khoản của bạn.')
                  : t('Tối đa 8 mâm gần nhất được giữ trên thiết bị để bạn dùng lại nhanh.')}
              </p>
            </div>
            <span className="history-count">
              <AppIcon name="history" size={17} /> {t('{count} mâm', { count: history.length })}
            </span>
          </div>

          {history.length === 0 ? (
            <div className="saved-meals-empty">
              <span>
                <AppIcon name="plate" size={36} />
              </span>
              <strong>{t('Chưa có mâm cơm nào được lưu')}</strong>
              <p>{t('Quay đủ món và chọn “Lưu mâm cơm này” để xem lại tại đây.')}</p>
            </div>
          ) : (
            <>
              <div className="saved-meal-filters" aria-label={t('Lọc mâm cơm đã lưu')}>
                <div className="saved-meal-search">
                  <SearchField
                    label={t('Tìm theo tên món hoặc tiêu chuẩn')}
                    onChange={setHistoryQuery}
                    placeholder={t('Tìm tên món hoặc tiêu chuẩn đã lưu…')}
                    value={historyQuery}
                  />
                </div>
                <label>
                  <span>{t('Tiêu chuẩn')}</span>
                  <select
                    aria-label={t('Lọc theo tiêu chuẩn')}
                    onChange={(event) =>
                      setHistoryProfile(event.target.value as 'all' | MealProfile)
                    }
                    value={historyProfile}
                  >
                    <option value="all">{t('Tất cả tiêu chuẩn')}</option>
                    {(Object.keys(profileDetails) as MealProfile[]).map((key) => (
                      <option key={key} value={key}>
                        {t(profileDetails[key].label)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t('Số món')}</span>
                  <select
                    aria-label={t('Lọc theo số món')}
                    onChange={(event) =>
                      setHistoryDishCount(
                        event.target.value === 'all' ? 'all' : Number(event.target.value),
                      )
                    }
                    value={historyDishCount}
                  >
                    <option value="all">{t('Tất cả số món')}</option>
                    {[3, 4, 5, 6].map((count) => (
                      <option key={count} value={count}>
                        {t('{count} món', { count })}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="saved-meal-results" aria-live="polite">
                {t('Hiển thị {shown} / {total} mâm cơm', {
                  shown: filteredHistory.length,
                  total: history.length,
                })}
              </p>
              {filteredHistory.length === 0 ? (
                <div className="saved-meals-empty saved-meals-empty--filtered">
                  <span>
                    <AppIcon name="search" size={32} />
                  </span>
                  <strong>{t('Không tìm thấy mâm cơm phù hợp')}</strong>
                  <p>{t('Thử đổi từ khóa hoặc điều kiện lọc để xem thêm mâm đã lưu.')}</p>
                </div>
              ) : (
                <div className="saved-meal-grid">
                  {filteredHistory.map((meal) => {
                    const savedSlots = restoreMealSlots(meal.dishIds);
                    return (
                      <article className="saved-meal-card" key={meal.id}>
                        <div className="saved-meal-card__images">
                          {savedSlots.map((slot, index) => (
                            <figure key={slot.dish!.id}>
                              <img
                                alt={slot.dish!.imageAlt}
                                loading="lazy"
                                src={slot.dish!.image}
                              />
                              <figcaption>
                                {index + 1}. {t(roleDetails[slot.role].shortLabel)}
                              </figcaption>
                            </figure>
                          ))}
                        </div>
                        <div className="saved-meal-card__body">
                          <div>
                            <span>
                              <AppIcon name={profileIcons[meal.profile]} size={20} />
                            </span>
                            <span>
                              <strong>
                                {t('Mâm {profile}', {
                                  profile: t(profileDetails[meal.profile].label).toLocaleLowerCase(
                                    locale,
                                  ),
                                })}
                              </strong>
                              <small>
                                {formatDate(meal.createdAt, {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })}
                                {' · '}
                                {t('{count} món', { count: savedSlots.length })}
                              </small>
                            </span>
                          </div>
                          <ul>
                            {savedSlots.map((slot) => (
                              <li key={slot.dish!.id}>{slot.dish!.name}</li>
                            ))}
                          </ul>
                          <button
                            className="text-link"
                            disabled={spinning}
                            onClick={() => reuseMeal(meal)}
                            type="button"
                          >
                            {t('Dùng lại mâm này')} <AppIcon name="arrow" size={15} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <section className="random-help-band">
        <div className="container">
          <div>
            <span className="section-label section-label--light">
              {t('Muốn tự chọn từng món?')}
            </span>
            <h2>{t('Bạn vẫn có thể ghép mâm theo khẩu vị riêng.')}</h2>
          </div>
          <Link className="button button--cream" to="/recipes">
            {t('Mở kho món Việt')} <AppIcon name="arrow" size={17} />
          </Link>
        </div>
      </section>
    </div>
  );
}
