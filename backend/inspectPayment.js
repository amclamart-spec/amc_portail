const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const paymentId = '47ac9567-644d-42e4-b956-571485842007';
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { family: true }
  });
  console.log('payment', {
    id: payment?.id,
    status: payment?.status,
    paymentMethod: payment?.paymentMethod,
    provider: payment?.provider,
    totalAmount: payment?.totalAmount?.toString(),
    enrollmentIds: Array.isArray(payment?.metadata?.enrollmentIds) ? payment.metadata.enrollmentIds : payment?.metadata?.enrollmentIds,
  });
  if (!payment) { await prisma.$disconnect(); return; }
  const ids = Array.isArray(payment.metadata?.enrollmentIds) ? payment.metadata.enrollmentIds : [];
  const enrollments = await prisma.enrollment.findMany({
    where: { id: { in: ids } },
    include: { class: { include: { level: { include: { pole: true } } } }, student: true }
  });
  console.log('enrollments count', enrollments.length);
  enrollments.forEach((en, idx) => {
    console.log(idx+1, {
      id: en.id,
      comment: en.comment,
      classId: en.classId,
      classRoom: en.class?.room,
      classLevelName: en.class?.level?.name,
      classPoleName: en.class?.level?.pole?.name,
      classLevelCode: en.class?.level?.code,
      student: en.student ? `${en.student.firstName} ${en.student.lastName}` : null,
    });
  });
  await prisma.$disconnect();
})();
