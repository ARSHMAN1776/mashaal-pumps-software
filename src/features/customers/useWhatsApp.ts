import { useToast } from '../../components/common/Toast'
import { openWhatsApp } from './whatsapp'

/** Opens WhatsApp with a message, and says so when the phone number on file cannot be opened (the person then picks the contact). */
export function useWhatsApp() {
  const toast = useToast()
  return (phone: string, message: string) => {
    if (openWhatsApp(phone, message)) return
    toast.info(
      phone.trim()
        ? 'The phone number saved for this customer is not a mobile number WhatsApp can open. Choose the contact in WhatsApp.'
        : 'No phone number is saved for this customer. Choose the contact in WhatsApp.',
    )
  }
}
