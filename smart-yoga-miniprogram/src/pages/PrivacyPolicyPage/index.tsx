import { View, Text } from '@tarojs/components';
import './index.module.scss'; // Create an empty SCSS file if you want specific styles later
import * as i18n from '../../config/i18n';

const PrivacyPolicyPage = () => {
  return (
    <View className='privacy-policy-page'>
      <Text className='title'>{i18n.PRIVACY_POLICY_PAGE_TITLE}</Text>
      <View className='content'>
        <Text>{i18n.PRIVACY_POLICY_CONTENT_MAIN}</Text>
        <Text>{i18n.PRIVACY_POLICY_CONTENT_PLATFORM_REQUIREMENTS}</Text>
        <Text>{i18n.PRIVACY_POLICY_LAST_UPDATED}</Text>
      </View>
    </View>
  );
};
export default PrivacyPolicyPage;
