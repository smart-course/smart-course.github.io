/* 灵田与静修共用的外观资料规则；不涉及资产、奖励或真实身份推断。 */
(function (global) {
  'use strict';
  const EMPTY = Object.freeze({ gender: null, avatarId: null, profileChosen: false });
  const AVATARS = Object.freeze(['jade', 'peach', 'cloud', 'ink']);
  const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
  function fail() { const error = new Error('请选择有效的头像与性别选项。'); error.code = 'invalid_identity'; throw error; }
  function choose(value) {
    if (!record(value) || Object.keys(value).length !== 2 || Object.keys(value).some(key => !['gender', 'avatarId'].includes(key)) || ![null, 'male', 'female'].includes(value.gender) || !AVATARS.includes(value.avatarId)) fail();
    // 头像只决定游戏形象，不由头像推断用户性别；性别可以暂不设置。
    return { gender: value.gender, avatarId: value.avatarId, profileChosen: true };
  }
  function normalize(value) {
    if (value === undefined || value === null) return { ...EMPTY };
    if (!record(value) || Object.keys(value).length !== 3 || Object.keys(value).some(key => !['gender', 'avatarId', 'profileChosen'].includes(key)) || typeof value.profileChosen !== 'boolean') fail();
    if (!value.profileChosen) {
      if (value.gender !== null || value.avatarId !== null) fail();
      return { ...EMPTY };
    }
    return choose({ gender: value.gender, avatarId: value.avatarId });
  }
  global.SpiritPlayerIdentity = Object.freeze({ EMPTY, AVATARS, choose, normalize });
})(typeof globalThis !== 'undefined' ? globalThis : window);
