const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const REGISTRATION_BLOCK_KEY = 'REGISTRATIONS_BLOCKED';

async function getAppSetting(key) {
  const setting = await prisma.appSetting.findUnique({ where: { key } });
  return setting ? setting.value : null;
}

async function setAppSetting(key, value) {
  const existing = await prisma.appSetting.findUnique({ where: { key } });
  if (existing) {
    return prisma.appSetting.update({ where: { key }, data: { value } });
  }
  return prisma.appSetting.create({ data: { key, value } });
}

async function isRegistrationBlocked() {
  const value = await getAppSetting(REGISTRATION_BLOCK_KEY);
  return String(value).toLowerCase() === 'true';
}

async function getRegistrationBlock() {
  const value = await getAppSetting(REGISTRATION_BLOCK_KEY);
  return { blocked: String(value).toLowerCase() === 'true' };
}

async function setRegistrationBlock(blocked) {
  return setAppSetting(REGISTRATION_BLOCK_KEY, blocked ? 'true' : 'false');
}

module.exports = {
  getAppSetting,
  setAppSetting,
  isRegistrationBlocked,
  getRegistrationBlock,
  setRegistrationBlock,
};
