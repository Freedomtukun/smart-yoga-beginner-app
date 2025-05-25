import { View, Text } from '@tarojs/components';
import './index.module.scss'; // Create an empty SCSS file
import * as i18n from '../../config/i18n';

const UserAgreementPage = () => {
  return (
    <View className='user-agreement-page'>
      <Text className='title'>{i18n.USER_AGREEMENT_PAGE_TITLE}</Text>
      <View className='content'>
        <Text>{i18n.USER_AGREEMENT_CONTENT_MAIN}</Text>
        <Text>{i18n.USER_AGREEMENT_CONTENT_PLATFORM_REQUIREMENTS}</Text>
        <Text>{i18n.USER_AGREEMENT_LAST_UPDATED}</Text>
      </View>
    </View>
  );
};
export default UserAgreementPage;
